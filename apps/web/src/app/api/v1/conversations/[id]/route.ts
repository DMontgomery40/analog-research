import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'
import {
  initConversationAuth,
  verifyConversationAccessAndMarkRead,
} from '@/lib/conversation-access'
import { resolveMessageAttachmentsForResponse } from '@/lib/message-attachments'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/conversations/[id]/route.ts', 'GET')
  const { id: conversationId } = await params

  const auth = await initConversationAuth(request)
  if (!auth.ok) return auth.response

  // Get conversation with related data
  const { data: convData, error: convError } = await auth.serviceClient
    .from('conversations')
    .select(`
      *,
      agents(id, name),
      humans(id, name, avatar_url),
      messages(id, content, attachments, sender_type, sender_id, is_read, created_at)
    `)
    .eq('id', conversationId)
    .single()

  const convResult = handleSingleResult(convData, convError, log, 'Conversation', { conversationId })
  if (convResult.response) return convResult.response
  const conversation = convResult.data

  // Verify access and mark as read
  const accessResult = await verifyConversationAccessAndMarkRead(
    auth,
    auth.supabase,
    auth.serviceClient,
    log,
    conversation,
    conversationId
  )
  if (!accessResult.ok) return accessResult.response

  // Sort messages by created_at ascending
  const messages = (conversation.messages || []).sort(
    (a: { created_at: string }, b: { created_at: string }) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const messagesWithAttachments = await Promise.all(
    messages.map(async (message: Record<string, unknown>) => ({
      ...message,
      attachments: await resolveMessageAttachmentsForResponse(
        auth.serviceClient,
        message.attachments,
        conversationId
      ),
    }))
  )

  return NextResponse.json({
    success: true,
    data: {
      ...conversation,
      messages: messagesWithAttachments,
    },
  })
}
