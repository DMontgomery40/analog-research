import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import {
  authenticateChannelRequest,
  validateChannelConfig,
} from '@/lib/notification-channels-auth'

const updateChannelSchema = z.object({
  channel_config: z.record(z.unknown()).optional(),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET /api/v1/notification-channels/[id] - Get channel
export async function GET(request: NextRequest, context: RouteContext) {
  const log = logger.withContext('api/v1/notification-channels/[id]', 'GET')
  const auth = await authenticateChannelRequest(request, log)
  if (!auth.ok) return auth.response

  const { entityType, entityId, serviceClient } = auth
  const { id } = await context.params

  const { data: channel, error } = await serviceClient
    .from('notification_channels')
    .select('*')
    .eq('id', id)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .single()

  if (error || !channel) {
    return NextResponse.json({ success: false, error: 'Channel not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: channel })
}

// PATCH /api/v1/notification-channels/[id] - Update channel
export async function PATCH(request: NextRequest, context: RouteContext) {
  const log = logger.withContext('api/v1/notification-channels/[id]', 'PATCH')
  const auth = await authenticateChannelRequest(request, log)
  if (!auth.ok) return auth.response

  const { entityType, entityId, serviceClient } = auth
  const { id } = await context.params

  // Verify channel exists and belongs to entity
  const { data: existing, error: fetchError } = await serviceClient
    .from('notification_channels')
    .select('*')
    .eq('id', id)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ success: false, error: 'Channel not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parseResult = updateChannelSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body', details: parseResult.error.flatten() },
      { status: 400 }
    )
  }

  const updates: Record<string, unknown> = {}

  if (parseResult.data.name !== undefined) {
    updates.name = parseResult.data.name
  }

  if (parseResult.data.enabled !== undefined) {
    updates.enabled = parseResult.data.enabled
  }

  if (parseResult.data.channel_config !== undefined) {
    const configValidation = await validateChannelConfig(existing.channel_type, parseResult.data.channel_config)
    if (!configValidation.ok) {
      return NextResponse.json({ success: false, error: configValidation.error }, { status: 400 })
    }
    updates.channel_config = configValidation.config
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true, data: existing })
  }

  const { data: channel, error } = await serviceClient
    .from('notification_channels')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    log.error('Failed to update channel', { channelId: id }, error)
    return NextResponse.json({ success: false, error: 'Failed to update channel' }, { status: 500 })
  }

  log.info('Channel updated', { channelId: id })

  return NextResponse.json({ success: true, data: channel })
}

// DELETE /api/v1/notification-channels/[id] - Delete channel
export async function DELETE(request: NextRequest, context: RouteContext) {
  const log = logger.withContext('api/v1/notification-channels/[id]', 'DELETE')
  const auth = await authenticateChannelRequest(request, log)
  if (!auth.ok) return auth.response

  const { entityType, entityId, serviceClient } = auth
  const { id } = await context.params

  // Verify channel exists and belongs to entity
  const { data: existing, error: fetchError } = await serviceClient
    .from('notification_channels')
    .select('id')
    .eq('id', id)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ success: false, error: 'Channel not found' }, { status: 404 })
  }

  const { error } = await serviceClient
    .from('notification_channels')
    .delete()
    .eq('id', id)

  if (error) {
    log.error('Failed to delete channel', { channelId: id }, error)
    return NextResponse.json({ success: false, error: 'Failed to delete channel' }, { status: 500 })
  }

  log.info('Channel deleted', { channelId: id })

  return NextResponse.json({ success: true, message: 'Channel deleted' })
}
