import { NextRequest, NextResponse } from 'next/server'
import { AppError, normalizeError, toPublicErrorPayload, withRequestId } from '@/lib/errors'
import { listNotifications, markNotificationsRead, parseMarkReadRequest } from '@/lib/notifications'
import { safeParseHumanNotificationsQuery } from '@/lib/notifications-query'
import { logger } from '@/lib/logger'
import { requireHumanSession } from '@/lib/session-auth'

// GET /api/v1/notifications - list notifications for current user
export async function GET(request: NextRequest) {
  const { log, requestId } = logger.withRequest(request, 'api/v1/notifications/route.ts', 'GET')
  const session = await requireHumanSession(log)
  if (!session.ok) return withRequestId(session.response, requestId)
  const { human, supabase } = session

  const url = new URL(request.url)
  const parseResult = safeParseHumanNotificationsQuery(url.searchParams)

  if (!parseResult.success) {
    return withRequestId(
      NextResponse.json(
        {
          ...toPublicErrorPayload(
            new AppError('Invalid query parameters', {
              status: 400,
              operatorHint: 'check notifications query',
              requestId,
            })
          ),
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      ),
      requestId
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

    return withRequestId(
      NextResponse.json({
        success: true,
        data: {
          ...result,
          limit,
          offset,
        },
      }),
      requestId
    )
  } catch (error) {
    const normalized = normalizeError(error, {
      message: 'Failed to list notifications',
      operatorHint: 'check notifications query',
      requestId,
      status: 500,
    })

    log.error('Notifications query failed', { humanId: human.id }, normalized)

    return withRequestId(
      NextResponse.json(toPublicErrorPayload(normalized), { status: normalized.status ?? 500 }),
      requestId
    )
  }
}

// PATCH /api/v1/notifications - mark notifications as read
export async function PATCH(request: NextRequest) {
  const { log: patchLog, requestId } = logger.withRequest(
    request,
    'api/v1/notifications/route.ts',
    'PATCH'
  )
  const session = await requireHumanSession(patchLog)
  if (!session.ok) return withRequestId(session.response, requestId)
  const { human, supabase } = session

  const parseResult = await parseMarkReadRequest(request)
  if (!parseResult.ok) {
    return withRequestId(
      NextResponse.json(
        {
          ...toPublicErrorPayload(
            new AppError(parseResult.error, {
              status: parseResult.status,
              operatorHint: parseResult.operatorHint,
              requestId,
            })
          ),
          details: parseResult.details,
        },
        { status: parseResult.status }
      ),
      requestId
    )
  }

  try {
    await markNotificationsRead(supabase, {
      recipientType: 'human',
      recipientId: human.id,
      notificationIds: parseResult.notificationIds,
      markAll: parseResult.markAll,
    })

    return withRequestId(
      NextResponse.json({
        success: true,
        message: parseResult.markAll
          ? 'All notifications marked as read'
          : `${parseResult.notificationIds?.length ?? 0} notification(s) marked as read`,
      }),
      requestId
    )
  } catch (error) {
    const normalized = normalizeError(error, {
      message: 'Failed to update notifications',
      operatorHint: 'check notifications update',
      requestId,
      status: 500,
    })

    patchLog.error('Notification update failed', { humanId: human.id }, normalized)

    return withRequestId(
      NextResponse.json(toPublicErrorPayload(normalized), { status: normalized.status ?? 500 }),
      requestId
    )
  }
}
