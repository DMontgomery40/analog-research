import { NextRequest, NextResponse } from 'next/server'
import { hasAgentScope } from '@/lib/api-auth'
import {
  getModerationRuntimeConfig,
  moderateContent,
  moderationColumnsFromResult,
  persistModerationEvent,
  queueModerationRescan,
  toModerationResponse,
} from '@/lib/moderation'
import { parseBoundedIntegerParam } from '@/lib/request-params'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'
import {
  initConversationAuth,
  verifyConversationAccessAndMarkRead,
  verifyConversationAccessForSend,
} from '@/lib/conversation-access'
import { createNotification } from '@/lib/notifications'
import { normalizeMessageAttachmentsForInsert, resolveMessageAttachmentsForResponse } from '@/lib/message-attachments'
import { z } from 'zod'

export const runtime = 'nodejs'

const sendMessageSchema = z.object({
  content: z.string().max(5000).optional(),
  attachments: z.array(
    z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      path: z.string().min(1).optional(),
      url: z.string().url().optional(),
    }).refine((value) => Boolean(value.path || value.url), {
      message: 'Attachment must include path or url',
    })
  ).max(10).optional(),
}).refine((value) => {
  const content = (value.content || '').trim()
  const attachments = value.attachments || []
  return content.length > 0 || attachments.length > 0
}, {
  message: 'Message content or attachments are required',
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/conversations/[id]/messages/route.ts', 'GET')
  const { id: conversationId } = await params
  const limitResult = parseBoundedIntegerParam(request.nextUrl.searchParams.get('limit'), {
    paramName: 'limit',
    min: 1,
    max: 100,
    defaultValue: 50,
  })

  if (!limitResult.ok) {
    return NextResponse.json({ success: false, error: limitResult.error }, { status: 400 })
  }

  const auth = await initConversationAuth(request)
  if (!auth.ok) return auth.response

  const { data: convData, error: convError } = await auth.serviceClient
    .from('conversations')
    .select('id, agent_id, human_id')
    .eq('id', conversationId)
    .single()

  const convResult = handleSingleResult(convData, convError, log, 'Conversation', { conversationId })
  if (convResult.response) return convResult.response

  const accessResult = await verifyConversationAccessAndMarkRead(
    auth,
    auth.supabase,
    auth.serviceClient,
    log,
    convResult.data,
    conversationId
  )
  if (!accessResult.ok) return accessResult.response

  const { data, error } = await auth.serviceClient
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limitResult.value)

  if (error) {
    log.error('Failed to fetch messages', { conversationId }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const resolvedMessages = await Promise.all(
    (data || []).map(async (message) => ({
      ...message,
      attachments: await resolveMessageAttachmentsForResponse(
        auth.serviceClient,
        message.attachments,
        conversationId
      ),
    }))
  )

  return NextResponse.json({ success: true, data: resolvedMessages.reverse() })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const postLog = logger.withContext('api/v1/conversations/[id]/messages/route.ts', 'POST')
  const { id: conversationId } = await params

  const auth = await initConversationAuth(request)
  if (!auth.ok) return auth.response

  if (auth.agent && !hasAgentScope(auth.agent, 'write')) {
    return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = sendMessageSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  const content = (parsed.data.content || '').trim()
  const { attachments, error: attachmentsError } = normalizeMessageAttachmentsForInsert(
    parsed.data.attachments,
    conversationId
  )

  if (attachmentsError) {
    return NextResponse.json({ success: false, error: attachmentsError }, { status: 400 })
  }

  const { data: convData, error: convError } = await auth.serviceClient
    .from('conversations')
    .select('id, agent_id, human_id')
    .eq('id', conversationId)
    .single()

  const convResult = handleSingleResult(convData, convError, postLog, 'Conversation', { conversationId })
  if (convResult.response) return convResult.response

  const sendAccess = await verifyConversationAccessForSend(
    auth,
    auth.supabase,
    auth.serviceClient,
    postLog,
    convResult.data
  )
  if (!sendAccess.ok) return sendAccess.response

  const { senderType, senderId, recipientType, recipientId } = sendAccess

  const moderationConfig = await getModerationRuntimeConfig(auth.serviceClient)
  const moderationResult = await moderateContent({
    supabase: auth.serviceClient,
    config: moderationConfig,
    input: {
      surface: 'message',
      actorType: senderType,
      actorId: senderId,
      contentType: 'message',
      content: content || '[Attachment-only message]',
      contentId: conversationId,
      metadata: {
        conversation_id: conversationId,
        recipient_type: recipientType,
        recipient_id: recipientId,
      },
    },
  })

  if (moderationResult.spamAction === 'cooldown') {
    const decisionId = await persistModerationEvent(auth.serviceClient, {
      surface: 'message',
      contentType: 'message',
      contentId: null,
      actorType: senderType,
      actorId: senderId,
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
    const decisionId = await persistModerationEvent(auth.serviceClient, {
      surface: 'message',
      contentType: 'message',
      contentId: null,
      actorType: senderType,
      actorId: senderId,
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

  const { data, error } = await auth.serviceClient
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: senderType,
      sender_id: senderId,
      content,
      attachments,
      ...moderationColumnsFromResult(moderationResult),
    })
    .select()
    .single()

  if (error) {
    postLog.error('Failed to create message', { conversationId, senderType, senderId }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Notify recipient and deliver to their configured channels
  await createNotification(auth.serviceClient, {
    recipientType,
    recipientId,
    type: 'new_message',
    title: 'New message',
    body: content
      ? `You have a new message in conversation ${conversationId}`
      : `You received new attachments in conversation ${conversationId}`,
    data: { conversation_id: conversationId, message_id: data.id },
  })

  let decisionId: string | null = null
  try {
    decisionId = await persistModerationEvent(auth.serviceClient, {
      surface: 'message',
      contentType: 'message',
      contentId: data.id,
      actorType: senderType,
      actorId: senderId,
      result: moderationResult,
    })
  } catch (error) {
    postLog.error('Failed to persist moderation event (non-blocking)', { conversationId, messageId: data.id }, error instanceof Error ? { message: error.message } : { message: String(error) })
  }

  if (moderationResult.needsRescan) {
    try {
      await queueModerationRescan(auth.serviceClient, {
        surface: 'message',
        contentType: 'message',
        contentId: data.id,
        actorType: senderType,
        actorId: senderId,
        contentText: content || '[Attachment-only message]',
        reason: moderationResult.timedOut ? 'timeout' : 'provider_error',
      })
    } catch (error) {
      postLog.error('Failed to queue moderation rescan (non-blocking)', { conversationId, messageId: data.id }, error instanceof Error ? { message: error.message } : { message: String(error) })
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      ...data,
      attachments: await resolveMessageAttachmentsForResponse(
        auth.serviceClient,
        data.attachments,
        conversationId
      ),
    },
    moderation: toModerationResponse(moderationResult, {
      contentType: 'message',
      contentId: data.id,
      decisionId,
    }),
  }, { status: 201 })
}
