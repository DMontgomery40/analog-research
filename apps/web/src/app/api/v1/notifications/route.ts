import { NextRequest, NextResponse } from 'next/server'
import { listNotifications, markNotificationsRead, parseMarkReadRequest } from '@/lib/notifications'
import { safeParseHumanNotificationsQuery } from '@/lib/notifications-query'
import { logger } from '@/lib/logger'
import { requireHumanSession } from '@/lib/session-auth'

// GET /api/v1/notifications - list notifications for current user
export async function GET(request: NextRequest) {
  const log = logger.withContext('api/v1/notifications/route.ts', 'GET')
  const session = await requireHumanSession(log)
  if (!session.ok) return session.response
  const { human, supabase } = session

  const url = new URL(request.url)
  const parseResult = safeParseHumanNotificationsQuery(url.searchParams)

  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid query parameters', details: parseResult.error.flatten() },
      { status: 400 }
    )
  }

  const { unread_only, limit, offset } = parseResult.data

  try {
    const result = await listNotifications(supabase, {
      recipientType: 'human',
      recipientId: human.id,
      unreadOnly: unread_only,
      limit,
      offset,
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
    log.error('Error listing notifications', { humanId: human.id }, error instanceof Error ? error : { message: String(error) })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list notifications' },
      { status: 500 }
    )
  }
}

// PATCH /api/v1/notifications - mark notifications as read
export async function PATCH(request: NextRequest) {
  const patchLog = logger.withContext('api/v1/notifications/route.ts', 'PATCH')
  const session = await requireHumanSession(patchLog)
  if (!session.ok) return session.response
  const { human, supabase } = session

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

  try {
    await markNotificationsRead(supabase, {
      recipientType: 'human',
      recipientId: human.id,
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
    patchLog.error('Error marking notifications as read', { humanId: human.id }, error instanceof Error ? error : { message: String(error) })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update notifications' },
      { status: 500 }
    )
  }
}
