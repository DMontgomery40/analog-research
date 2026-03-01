import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authenticateAgent } from '@/lib/api-auth'
import { resolveSessionOwnerAgent } from '@/lib/session-owner-agent'
import { handleSingleResult, logOnError, type LoggerLike } from '@/lib/supabase/errors'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'

type ConversationMinimal = {
  id: string
  agent_id: string
  human_id: string
}

type AuthenticatedAgent = {
  agentId: string
  scopes: string[]
}

export type ConversationAccessResult =
  | { ok: true; role: 'agent' | 'human'; actorId: string }
  | { ok: false; response: NextResponse }

/**
 * Result of initializing conversation endpoint auth
 */
export type ConversationAuthResult =
  | {
      ok: true
      user: { id: string } | null
      agent: AuthenticatedAgent | null
      asAgent: boolean
      supabase: SupabaseClient
      serviceClient: SupabaseClient
    }
  | { ok: false; response: NextResponse }

/**
 * Initialize auth for conversation endpoints that support both session and API auth.
 * Handles the common pattern of checking for user session OR agent API key.
 */
export async function initConversationAuth(
  request: NextRequest
): Promise<ConversationAuthResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const agent = await authenticateAgent(request)
  const asAgent = request.nextUrl.searchParams.get('as') === 'agent'

  if (!user && !agent) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    }
  }

  if (agent && !user) {
    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) {
      return { ok: false, response: rateLimitResponse }
    }
  }

  const serviceClient = await createServiceClient()

  return {
    ok: true,
    user: user ? { id: user.id } : null,
    agent: agent ? { agentId: agent.agentId, scopes: agent.scopes } : null,
    asAgent,
    supabase,
    serviceClient,
  }
}

/**
 * Verify access and mark conversation as read in one call.
 * Combines access verification with read-marking for GET endpoints.
 */
export async function verifyConversationAccessAndMarkRead(
  auth: { user: { id: string } | null; agent: AuthenticatedAgent | null; asAgent: boolean },
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  log: LoggerLike,
  conversation: ConversationMinimal,
  conversationId: string
): Promise<ConversationAccessResult> {
  if (auth.asAgent && auth.user) {
    const accessResult = await verifyAgentSessionAccess(serviceClient, log, auth.user.id, conversation)
    if (!accessResult.ok) return accessResult
    await markConversationAsRead(serviceClient, log, conversationId, 'agent')
    return accessResult
  } else if (auth.user) {
    const accessResult = await verifyHumanSessionAccess(supabase, log, auth.user.id, conversation)
    if (!accessResult.ok) return accessResult
    await markConversationAsRead(serviceClient, log, conversationId, 'human')
    return accessResult
  } else if (auth.agent) {
    return verifyAgentApiAccess(log, auth.agent, conversation)
  }
  return {
    ok: false,
    response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
  }
}

/**
 * Verify access and return sender/recipient info for message sending.
 */
export async function verifyConversationAccessForSend(
  auth: { user: { id: string } | null; agent: AuthenticatedAgent | null; asAgent: boolean },
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  log: LoggerLike,
  conversation: ConversationMinimal
): Promise<
  | { ok: true; senderType: 'human' | 'agent'; senderId: string; recipientType: 'human' | 'agent'; recipientId: string }
  | { ok: false; response: NextResponse }
> {
  if (auth.asAgent && auth.user) {
    const accessResult = await verifyAgentSessionAccess(serviceClient, log, auth.user.id, conversation)
    if (!accessResult.ok) return accessResult
    return {
      ok: true,
      senderType: 'agent',
      senderId: accessResult.actorId,
      recipientType: 'human',
      recipientId: conversation.human_id,
    }
  } else if (auth.user) {
    const accessResult = await verifyHumanSessionAccess(supabase, log, auth.user.id, conversation)
    if (!accessResult.ok) return accessResult
    return {
      ok: true,
      senderType: 'human',
      senderId: accessResult.actorId,
      recipientType: 'agent',
      recipientId: conversation.agent_id,
    }
  } else if (auth.agent) {
    const accessResult = verifyAgentApiAccess(log, auth.agent, conversation)
    if (!accessResult.ok) return accessResult
    return {
      ok: true,
      senderType: 'agent',
      senderId: accessResult.actorId,
      recipientType: 'human',
      recipientId: conversation.human_id,
    }
  }
  return {
    ok: false,
    response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
  }
}

/**
 * Mark messages as read and reset unread count for the accessing party.
 */
export async function markConversationAsRead(
  serviceClient: SupabaseClient,
  log: LoggerLike,
  conversationId: string,
  accessorRole: 'agent' | 'human'
): Promise<void> {
  const senderType = accessorRole === 'agent' ? 'human' : 'agent'
  const unreadField = accessorRole === 'agent' ? 'agent_unread_count' : 'human_unread_count'

  await logOnError(
    serviceClient
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('sender_type', senderType)
      .is('read_at', null),
    log,
    'Mark messages as read',
    { conversationId, accessorRole }
  )

  await logOnError(
    serviceClient
      .from('conversations')
      .update({ [unreadField]: 0 })
      .eq('id', conversationId),
    log,
    `Reset ${accessorRole} unread count`,
    { conversationId }
  )
}

/**
 * Verify conversation access for a session user acting as agent.
 * Returns the agent's ID if authorized, or an error response if not.
 */
export async function verifyAgentSessionAccess(
  serviceClient: SupabaseClient,
  log: LoggerLike,
  userId: string,
  conversation: ConversationMinimal
): Promise<ConversationAccessResult> {
  const ownerAgent = await resolveSessionOwnerAgent(serviceClient, userId)
  if (!ownerAgent || conversation.agent_id !== ownerAgent.agentId) {
    log.warn('Forbidden: user does not own conversation agent', {
      userId,
      conversationId: conversation.id,
    })
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true, role: 'agent', actorId: ownerAgent.agentId }
}

/**
 * Verify conversation access for a session user acting as human.
 * Returns the human's ID if authorized, or an error response if not.
 */
export async function verifyHumanSessionAccess(
  supabase: SupabaseClient,
  log: LoggerLike,
  userId: string,
  conversation: ConversationMinimal
): Promise<ConversationAccessResult> {
  const { data: humanData, error: humanError } = await supabase
    .from('humans')
    .select('id')
    .eq('user_id', userId)
    .single()

  const humanResult = handleSingleResult(humanData, humanError, log, 'Human profile', { userId })
  if (humanResult.response) {
    return { ok: false, response: humanResult.response }
  }

  if (conversation.human_id !== humanResult.data.id) {
    log.warn('Forbidden: human does not own conversation', {
      humanId: humanResult.data.id,
      conversationId: conversation.id,
    })
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true, role: 'human', actorId: humanResult.data.id }
}

/**
 * Verify conversation access for an API-authenticated agent.
 */
export function verifyAgentApiAccess(
  log: LoggerLike,
  agent: AuthenticatedAgent,
  conversation: ConversationMinimal
): ConversationAccessResult {
  if (conversation.agent_id !== agent.agentId) {
    log.warn('Forbidden: agent does not own conversation', {
      agentId: agent.agentId,
      conversationId: conversation.id,
    })
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true, role: 'agent', actorId: agent.agentId }
}
