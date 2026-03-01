import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authenticateAgent } from '@/lib/api-auth'
import {
  getModerationRuntimeConfig,
  moderateContent,
  moderationColumnsFromResult,
  persistModerationEvent,
  queueModerationRescan,
  toModerationResponse,
} from '@/lib/moderation'
import { logger } from '@/lib/logger'
import { handleSingleResult, logOnError } from '@/lib/supabase/errors'
import { z } from 'zod'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'
import { requireSessionOrAgent } from '@/lib/session-or-agent-auth'
import { parsePaginationParams } from '@/lib/request-params'
import { resolveOrCreateSessionOwnerAgent } from '@/lib/session-owner-agent'
import { ensureConversationLink } from '@/lib/conversation-links'

export const runtime = 'nodejs'

const createConversationSchema = z.object({
  human_id: z.string().uuid(),
  content: z.string().min(1).max(5000),
})

export async function GET(request: NextRequest) {
  const log = logger.withContext('api/v1/conversations/route.ts', 'GET')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const agent = await authenticateAgent(request)

  if (!user && !agent) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const paginationResult = parsePaginationParams(request.nextUrl.searchParams, {
    defaultLimit: 50,
    maxLimit: 200,
  })

  if (!paginationResult.ok) {
    return NextResponse.json({ success: false, error: paginationResult.error }, { status: 400 })
  }

  const { limit, offset } = paginationResult.value
  const serviceClient = await createServiceClient()

  if (user) {
    const { data: humanData, error: humanError } = await supabase
      .from('humans')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const humanResult = handleSingleResult(humanData, humanError, log, 'Human profile', { userId: user.id })
    if (humanResult.response) return humanResult.response
    const human = humanResult.data

    const { data, error, count } = await serviceClient
      .from('conversations')
      .select(`
        *,
        agents(id, name),
        messages(id, content, sender_type, created_at)
      `, { count: 'exact' })
      .eq('human_id', human.id)
      .order('last_message_at', { ascending: false })
      .order('created_at', { ascending: false, foreignTable: 'messages' })
      .limit(1, { foreignTable: 'messages' })
      .range(offset, offset + limit - 1)

    if (error) {
      log.error('Failed to fetch conversations', { humanId: human.id }, error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
      pagination: {
        limit,
        offset,
        total: count ?? 0,
      },
    })
  }

  if (agent) {
    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) return rateLimitResponse

    const { data, error, count } = await serviceClient
      .from('conversations')
      .select(`
        *,
        humans(id, name, avatar_url),
        messages(id, content, sender_type, created_at)
      `, { count: 'exact' })
      .eq('agent_id', agent.agentId)
      .order('last_message_at', { ascending: false })
      .order('created_at', { ascending: false, foreignTable: 'messages' })
      .limit(1, { foreignTable: 'messages' })
      .range(offset, offset + limit - 1)

    if (error) {
      log.error('Failed to fetch conversations', { agentId: agent.agentId }, error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
      pagination: {
        limit,
        offset,
        total: count ?? 0,
      },
    })
  }

  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
}

export async function POST(request: NextRequest) {
  const auth = await requireSessionOrAgent(request, { agentScope: 'write' })
  if (!auth.ok) return auth.response
  const { supabase: _supabase, user, agent } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = createConversationSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  const serviceClient = await createServiceClient()

  let agentId: string | null = null
  let ownerHumanId: string | null = null

  if (agent) {
    agentId = agent.agentId
  } else if (user) {
    const ownerAgent = await resolveOrCreateSessionOwnerAgent(serviceClient, user.id)
    if (!ownerAgent) {
      return NextResponse.json({ success: false, error: 'Owner agent profile not found' }, { status: 403 })
    }
    agentId = ownerAgent.agentId
    ownerHumanId = ownerAgent.humanId
  }

  if (!agentId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (ownerHumanId && ownerHumanId === parsed.data.human_id) {
    return NextResponse.json({ success: false, error: 'Cannot start a conversation with yourself' }, { status: 400 })
  }

  const postLog = logger.withContext('api/v1/conversations/route.ts', 'POST')

  const { data: conversation, error: conversationError } = await ensureConversationLink(serviceClient, {
    agentId,
    humanId: parsed.data.human_id,
  })

  if (conversationError || !conversation) {
    postLog.error('Failed to ensure conversation link', { agentId, humanId: parsed.data.human_id }, conversationError || { message: 'No data returned' })
    return NextResponse.json(
      { success: false, error: conversationError?.message || 'Failed to create conversation' },
      { status: 500 }
    )
  }

  const moderationConfig = await getModerationRuntimeConfig(serviceClient)
  const moderationResult = await moderateContent({
    supabase: serviceClient,
    config: moderationConfig,
    input: {
      surface: 'conversation_initial',
      actorType: 'agent',
      actorId: agentId,
      contentType: 'message',
      content: parsed.data.content,
      metadata: {
        conversation_id: conversation.id,
        human_id: parsed.data.human_id,
      },
    },
  })

  if (moderationResult.spamAction === 'cooldown') {
    const decisionId = await persistModerationEvent(serviceClient, {
      surface: 'conversation_initial',
      contentType: 'message',
      contentId: null,
      actorType: 'agent',
      actorId: agentId,
      result: moderationResult,
    })

    return NextResponse.json({
      success: false,
      error: 'Too many similar messages. Please wait before sending again.',
      code: 'SPAM_COOLDOWN',
      moderation: toModerationResponse(moderationResult, {
        contentType: 'message',
        contentId: null,
        decisionId,
      }),
    }, { status: 429 })
  }

  if (moderationResult.decision === 'fail') {
    const decisionId = await persistModerationEvent(serviceClient, {
      surface: 'conversation_initial',
      contentType: 'message',
      contentId: null,
      actorType: 'agent',
      actorId: agentId,
      result: moderationResult,
    })

    return NextResponse.json({
      success: false,
      error: 'Message blocked for safety or spam risk.',
      code: 'CONTENT_BLOCKED',
      moderation: toModerationResponse(moderationResult, {
        contentType: 'message',
        contentId: null,
        decisionId,
      }),
    }, { status: 422 })
  }

  // Create message
  const { data: message, error } = await serviceClient
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'agent',
      sender_id: agentId,
      content: parsed.data.content,
      ...moderationColumnsFromResult(moderationResult),
    })
    .select()
    .single()

  if (error) {
    postLog.error('Failed to create message', { conversationId: conversation.id, agentId }, error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Notify human (non-blocking)
  await logOnError(
    serviceClient.from('notifications').insert({
      recipient_type: 'human',
      recipient_id: parsed.data.human_id,
      type: 'new_message',
      title: 'New message',
      data: { conversation_id: conversation.id },
    }),
    postLog,
    'Create message notification',
    { conversationId: conversation.id, humanId: parsed.data.human_id }
  )

  const decisionId = await persistModerationEvent(serviceClient, {
    surface: 'conversation_initial',
    contentType: 'message',
    contentId: message.id,
    actorType: 'agent',
    actorId: agentId,
    result: moderationResult,
  })

  if (moderationResult.needsRescan) {
    await queueModerationRescan(serviceClient, {
      surface: 'conversation_initial',
      contentType: 'message',
      contentId: message.id,
      actorType: 'agent',
      actorId: agentId,
      contentText: parsed.data.content,
      reason: moderationResult.timedOut ? 'timeout' : 'provider_error',
    })
  }

  return NextResponse.json({
    success: true,
    data: { conversation, message },
    moderation: toModerationResponse(moderationResult, {
      contentType: 'message',
      contentId: message.id,
      decisionId,
    }),
  }, { status: 201 })
}
