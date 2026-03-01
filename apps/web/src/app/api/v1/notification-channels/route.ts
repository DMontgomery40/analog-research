import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import {
  authenticateChannelRequest,
  validateChannelConfig,
} from '@/lib/notification-channels-auth'

const createChannelSchema = z.object({
  channel_type: z.enum(['webhook', 'email', 'slack', 'discord']),
  channel_config: z.record(z.unknown()),
  name: z.string().optional(),
  enabled: z.boolean().optional().default(true),
})

// GET /api/v1/notification-channels - List channels
export async function GET(request: NextRequest) {
  const log = logger.withContext('api/v1/notification-channels', 'GET')
  const auth = await authenticateChannelRequest(request, log)
  if (!auth.ok) return auth.response

  const { entityType, entityId, serviceClient } = auth

  const { data: channels, error } = await serviceClient
    .from('notification_channels')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  if (error) {
    log.error('Failed to list channels', { entityType, entityId }, error)
    return NextResponse.json({ success: false, error: 'Failed to list channels' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: { channels, entity_type: entityType, entity_id: entityId },
  })
}

// POST /api/v1/notification-channels - Create channel
export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/notification-channels', 'POST')
  const auth = await authenticateChannelRequest(request, log)
  if (!auth.ok) return auth.response

  const { entityType, entityId, serviceClient } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parseResult = createChannelSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body', details: parseResult.error.flatten() },
      { status: 400 }
    )
  }

  const { channel_type, channel_config, name, enabled } = parseResult.data

  // Validate channel-specific config
  const configValidation = await validateChannelConfig(channel_type, channel_config)
  if (!configValidation.ok) {
    return NextResponse.json({ success: false, error: configValidation.error }, { status: 400 })
  }

  // Check for existing channel of same type
  const { data: existing } = await serviceClient
    .from('notification_channels')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('channel_type', channel_type)
    .single()

  if (existing) {
    return NextResponse.json(
      { success: false, error: `A ${channel_type} channel already exists. Update or delete the existing channel first.` },
      { status: 409 }
    )
  }

  const { data: channel, error } = await serviceClient
    .from('notification_channels')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      channel_type,
      channel_config: configValidation.config,
      name,
      enabled,
    })
    .select()
    .single()

  if (error) {
    log.error('Failed to create channel', { entityType, entityId, channel_type }, error)
    return NextResponse.json({ success: false, error: 'Failed to create channel' }, { status: 500 })
  }

  log.info('Channel created', { channelId: channel.id, entityType, entityId, channel_type })

  return NextResponse.json({ success: true, data: channel }, { status: 201 })
}
