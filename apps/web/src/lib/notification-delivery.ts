/**
 * Notification Delivery Service
 *
 * Orchestrates delivery of notifications to configured channels.
 * Supports both Humans and ResearchAgents (Agents) as recipients.
 *
 * Channels: webhook, email, slack, discord
 */

import { createServiceClient } from '@/lib/supabase/server'
import {
  deliverWebhook,
  deliverEmail,
  deliverSlack,
  deliverDiscord,
  type NotificationPayload,
  type WebhookConfig,
  type EmailConfig,
  type SlackConfig,
  type DiscordConfig,
  type DeliveryResult,
} from './notification-adapters'

// Channel types (until types are regenerated)
type ChannelType = 'webhook' | 'email' | 'slack' | 'discord'
type EntityType = 'human' | 'agent'

interface NotificationChannel {
  id: string
  entity_type: EntityType
  entity_id: string
  channel_type: ChannelType
  channel_config: Record<string, unknown>
  enabled: boolean
}

interface Notification {
  id: string
  recipient_type: EntityType
  recipient_id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  created_at: string
}

/**
 * Deliver a notification to all configured channels for the recipient.
 * This is the main entry point - call this after creating a notification.
 *
 * @param notification - The notification record from the database
 * @returns Array of delivery results, one per channel
 */
export async function deliverNotification(
  notification: Notification
): Promise<Array<{ channelId: string; channelType: ChannelType; result: DeliveryResult }>> {
  const serviceClient = await createServiceClient()

  // Get all enabled channels for this recipient
  const { data: channels, error } = await serviceClient
    .from('notification_channels')
    .select('*')
    .eq('entity_type', notification.recipient_type)
    .eq('entity_id', notification.recipient_id)
    .eq('enabled', true)

  if (error) {
    console.error('[notification-delivery] Failed to fetch channels:', error)
    return []
  }

  if (!channels || channels.length === 0) {
    // No channels configured - this is normal, not an error
    return []
  }

  const payload: NotificationPayload = {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data as Record<string, unknown>,
    created_at: notification.created_at,
    recipient_type: notification.recipient_type,
    recipient_id: notification.recipient_id,
  }

  // Deliver to all channels in parallel
  const results = await Promise.all(
    channels.map(async (channel: NotificationChannel) => {
      const result = await deliverToChannel(payload, channel)

      // Log delivery result to database
      await logDelivery(serviceClient, notification.id, channel.id, result)

      // Update channel stats
      await updateChannelStats(serviceClient, channel.id, result)

      return {
        channelId: channel.id,
        channelType: channel.channel_type,
        result,
      }
    })
  )

  return results
}

/**
 * Deliver to a specific channel based on type
 */
async function deliverToChannel(
  notification: NotificationPayload,
  channel: NotificationChannel
): Promise<DeliveryResult> {
  // Cast config through unknown to satisfy TypeScript - config is validated on insert
  const config = channel.channel_config as unknown

  try {
    switch (channel.channel_type) {
      case 'webhook':
        return await deliverWebhook(notification, config as WebhookConfig)
      case 'email':
        return await deliverEmail(notification, config as EmailConfig)
      case 'slack':
        return await deliverSlack(notification, config as SlackConfig)
      case 'discord':
        return await deliverDiscord(notification, config as DiscordConfig)
      default:
        return {
          success: false,
          error: `Unknown channel type: ${channel.channel_type}`,
        }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[notification-delivery] Channel ${channel.id} error:`, errorMessage)
    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Log delivery attempt to notification_delivery_log
 */
async function logDelivery(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  notificationId: string,
  channelId: string,
  result: DeliveryResult
): Promise<void> {
  const { error } = await serviceClient.from('notification_delivery_log').insert({
    notification_id: notificationId,
    channel_id: channelId,
    status: result.success ? 'delivered' : 'failed',
    error: result.error ?? null,
    response_status: result.responseStatus ?? null,
    response_body: result.responseBody ?? null,
    delivered_at: result.success ? new Date().toISOString() : null,
  })

  if (error) {
    console.error('[notification-delivery] Failed to log delivery:', error)
  }
}

/**
 * Update channel statistics after delivery attempt
 */
async function updateChannelStats(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  channelId: string,
  result: DeliveryResult
): Promise<void> {
  const nowIso = new Date().toISOString()

  if (result.success) {
    const { error } = await serviceClient.rpc('increment_channel_delivery_count', {
      p_channel_id: channelId,
    })
    if (error) {
      // Best-effort fallback if the RPC is missing/unavailable.
      const { data: channel } = await serviceClient
        .from('notification_channels')
        .select('delivery_count')
        .eq('id', channelId)
        .maybeSingle()

      if (!channel) return

      await serviceClient
        .from('notification_channels')
        .update({
          delivery_count: Number(channel.delivery_count || 0) + 1,
          last_delivered_at: nowIso,
          last_error: null,
        } as never)
        .eq('id', channelId)
    }
  } else {
    const { error } = await serviceClient.rpc('increment_channel_failure_count', {
      p_channel_id: channelId,
      p_error: result.error,
    })
    if (error) {
      // Best-effort fallback if the RPC is missing/unavailable.
      const { data: channel } = await serviceClient
        .from('notification_channels')
        .select('failure_count')
        .eq('id', channelId)
        .maybeSingle()

      if (!channel) return

      await serviceClient
        .from('notification_channels')
        .update({
          failure_count: Number(channel.failure_count || 0) + 1,
          last_error: result.error ?? null,
        } as never)
        .eq('id', channelId)
    }
  }
}

/**
 * Helper to send a test notification to a specific channel
 */
export async function sendTestNotification(channelId: string): Promise<DeliveryResult> {
  const serviceClient = await createServiceClient()

  const { data: channel, error } = await serviceClient
    .from('notification_channels')
    .select('*')
    .eq('id', channelId)
    .single()

  if (error || !channel) {
    return {
      success: false,
      error: 'Channel not found',
    }
  }

  const testPayload: NotificationPayload = {
    id: 'test-' + Date.now(),
    type: 'test',
    title: 'Test Notification from Analog Research',
    body: 'This is a test notification to verify your channel is configured correctly.',
    data: { test: true },
    created_at: new Date().toISOString(),
    recipient_type: channel.entity_type,
    recipient_id: channel.entity_id,
  }

  return await deliverToChannel(testPayload, channel as NotificationChannel)
}

/**
 * Get channels for a specific entity (for debugging/admin)
 */
export async function getChannelsForEntity(
  entityType: EntityType,
  entityId: string
): Promise<NotificationChannel[]> {
  const serviceClient = await createServiceClient()

  const { data: channels, error } = await serviceClient
    .from('notification_channels')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)

  if (error) {
    console.error('[notification-delivery] Failed to get channels:', error)
    return []
  }

  return (channels ?? []) as NotificationChannel[]
}
