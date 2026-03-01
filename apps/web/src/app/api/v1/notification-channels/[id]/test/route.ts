import { NextRequest, NextResponse } from 'next/server'
import { sendTestNotification } from '@/lib/notification-delivery'
import { logger } from '@/lib/logger'
import { authenticateChannelRequest } from '@/lib/notification-channels-auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/v1/notification-channels/[id]/test - Send test notification
export async function POST(request: NextRequest, context: RouteContext) {
  const log = logger.withContext('api/v1/notification-channels/[id]/test', 'POST')
  const auth = await authenticateChannelRequest(request, log)
  if (!auth.ok) return auth.response

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
    return NextResponse.json({ success: false, error: 'Channel not found' }, { status: 404 })
  }

  if (!channel.enabled) {
    return NextResponse.json(
      { success: false, error: 'Channel is disabled. Enable it first to send test notifications.' },
      { status: 400 }
    )
  }

  log.info('Sending test notification', { channelId: id, channelType: channel.channel_type })

  const result = await sendTestNotification(id)

  if (!result.success) {
    log.warn('Test notification failed', { channelId: id, error: result.error })
    return NextResponse.json(
      {
        success: false,
        error: 'Test notification failed',
        details: result.error,
        response_status: result.responseStatus,
      },
      { status: 400 }
    )
  }

  log.info('Test notification sent', { channelId: id })

  return NextResponse.json({
    success: true,
    message: 'Test notification sent successfully',
    response_status: result.responseStatus,
  })
}
