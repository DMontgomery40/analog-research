import { NextRequest, NextResponse } from 'next/server'
import { AppError, normalizeError, toPublicErrorPayload, withRequestId } from '@/lib/errors'
import { createServiceClient } from '@/lib/supabase/server'
import { authenticateAgent } from '@/lib/api-auth'
import { listNotifications, markNotificationsRead, parseMarkReadRequest, splitTypesParam } from '@/lib/notifications'
import { safeParseAgentNotificationsQuery } from '@/lib/notifications-query'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

// GET /api/v1/agent/notifications - list notifications for authenticated agent
export async function GET(request: NextRequest) {
  const { log, requestId } = logger.withRequest(
    request,
    'api/v1/agent/notifications/route.ts',
    'GET'
  )
  const agent = await authenticateAgent(request)
  if (!agent) {
    log.warn('Agent notifications auth failed', {
      requestId,
      operatorHint: 'authenticateAgent rejected API key and OAuth credentials',
    })
    return withRequestId(
      NextResponse.json(
        toPublicErrorPayload(
          new AppError('Unauthorized', {
            status: 401,
            operatorHint: 'authenticateAgent rejected API key and OAuth credentials',
            requestId,
          })
        ),
        { status: 401 }
      ),
      requestId
    )
  }

  const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
  if (rateLimitResponse) return withRequestId(rateLimitResponse, requestId)

  const url = new URL(request.url)
  const parseResult = safeParseAgentNotificationsQuery(url.searchParams)

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

    log.error('Agent notifications query failed', { agentId: agent.agentId }, normalized)

    return withRequestId(
      NextResponse.json(toPublicErrorPayload(normalized), { status: normalized.status ?? 500 }),
      requestId
    )
  }
}

// PATCH /api/v1/agent/notifications - mark notifications as read
export async function PATCH(request: NextRequest) {
  const { log, requestId } = logger.withRequest(
    request,
    'api/v1/agent/notifications/route.ts',
    'PATCH'
  )
  const agent = await authenticateAgent(request)
  if (!agent) {
    log.warn('Agent notifications auth failed', {
      requestId,
      operatorHint: 'authenticateAgent rejected API key and OAuth credentials',
    })
    return withRequestId(
      NextResponse.json(
        toPublicErrorPayload(
          new AppError('Unauthorized', {
            status: 401,
            operatorHint: 'authenticateAgent rejected API key and OAuth credentials',
            requestId,
          })
        ),
        { status: 401 }
      ),
      requestId
    )
  }

  const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
  if (rateLimitResponse) return withRequestId(rateLimitResponse, requestId)

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

  const supabase = await createServiceClient()

  try {
    await markNotificationsRead(supabase, {
      recipientType: 'agent',
      recipientId: agent.agentId,
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

    log.error('Agent notification update failed', { agentId: agent.agentId }, normalized)

    return withRequestId(
      NextResponse.json(toPublicErrorPayload(normalized), { status: normalized.status ?? 500 }),
      requestId
    )
  }
}
