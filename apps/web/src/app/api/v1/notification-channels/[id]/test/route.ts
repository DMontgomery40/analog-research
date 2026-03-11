import { NextRequest, NextResponse } from 'next/server'
import { AppError, toPublicErrorPayload, withRequestId } from '@/lib/errors'
import { sendTestNotification } from '@/lib/notification-delivery'
import { logger } from '@/lib/logger'
import { authenticateChannelRequest } from '@/lib/notification-channels-auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/v1/notification-channels/[id]/test - Send test notification
export async function POST(request: NextRequest, context: RouteContext) {
  const { log, requestId } = logger.withRequest(
    request,
    'api/v1/notification-channels/[id]/test',
    'POST'
  )
  const auth = await authenticateChannelRequest(request, log)
  if (!auth.ok) return withRequestId(auth.response, requestId)

  const { entityType, entityId, serviceClient } = auth
  const { id } = await context.params

  // Verify channel exists and belongs to entity
  const { data: channel, error: fetchError } = await serviceClient
    .from('notification_channels')
    .select('*')
    .eq('id', id)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .single()

  if (fetchError || !channel) {
    return withRequestId(
      NextResponse.json(
        toPublicErrorPayload(
          new AppError('Channel not found', {
            status: 404,
            operatorHint: 'check notification_channels row',
            requestId,
          })
        ),
        { status: 404 }
      ),
      requestId
    )
  }

  if (!channel.enabled) {
    return withRequestId(
      NextResponse.json(
        toPublicErrorPayload(
          new AppError('Channel is disabled. Enable it first to send test notifications.', {
            status: 400,
            operatorHint: 'check channel enabled flag',
            requestId,
          })
        ),
        { status: 400 }
      ),
      requestId
    )
  }

  log.info('Sending test notification', { channelId: id, channelType: channel.channel_type })

  const result = await sendTestNotification(id)

  if (!result.success) {
    log.warn('Test notification failed', { channelId: id, error: result.error })
    return withRequestId(
      NextResponse.json(
        {
          ...toPublicErrorPayload(
            new AppError('Test notification failed', {
              status: 400,
              operatorHint: result.operatorHint || 'check channel delivery',
              requestId,
            })
          ),
          details: result.error,
          response_status: result.responseStatus,
        },
        { status: 400 }
      ),
      requestId
    )
  }

  log.info('Test notification sent', { channelId: id })

  return withRequestId(
    NextResponse.json({
      success: true,
      message: 'Test notification sent successfully',
      response_status: result.responseStatus,
    }),
    requestId
  )
}
