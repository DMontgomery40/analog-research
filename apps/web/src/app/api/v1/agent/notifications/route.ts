import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { authenticateAgent } from '@/lib/api-auth'
import { listNotifications, markNotificationsRead, parseMarkReadRequest, splitTypesParam } from '@/lib/notifications'
import { safeParseAgentNotificationsQuery } from '@/lib/notifications-query'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'

export const runtime = 'nodejs'

// GET /api/v1/agent/notifications - list notifications for authenticated agent
export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request)
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
  if (rateLimitResponse) return rateLimitResponse

  const url = new URL(request.url)
  const parseResult = safeParseAgentNotificationsQuery(url.searchParams)

  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid query parameters', details: parseResult.error.flatten() },
      { status: 400 }
    )
  }

  const { unread_only, limit, offset, types } = parseResult.data
  const typeFilter = splitTypesParam(types)

  const supabase = await createServiceClient()

  try {
    const result = await listNotifications(supabase, {
      recipientType: 'agent',
      recipientId: agent.agentId,
      unreadOnly: unread_only,
      limit,
      offset,
      types: typeFilter.length > 0 ? typeFilter : undefined,
    })

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        limit,
        offset,
      },
    })
  } catch (error) {
    console.error('Error listing agent notifications:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list notifications' },
      { status: 500 }
    )
  }
}

// PATCH /api/v1/agent/notifications - mark notifications as read
export async function PATCH(request: NextRequest) {
  const agent = await authenticateAgent(request)
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
  if (rateLimitResponse) return rateLimitResponse

  const parseResult = await parseMarkReadRequest(request)
  if (!parseResult.ok) {
    return NextResponse.json(
      {
        success: false,
        error: parseResult.error,
        details: parseResult.details,
      },
      { status: parseResult.status }
    )
  }

  const supabase = await createServiceClient()

  try {
    await markNotificationsRead(supabase, {
      recipientType: 'agent',
      recipientId: agent.agentId,
      notificationIds: parseResult.notificationIds,
      markAll: parseResult.markAll,
    })

    return NextResponse.json({
      success: true,
      message: parseResult.markAll
        ? 'All notifications marked as read'
        : `${parseResult.notificationIds?.length ?? 0} notification(s) marked as read`,
    })
  } catch (error) {
    console.error('Error marking agent notifications as read:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update notifications' },
      { status: 500 }
    )
  }
}
