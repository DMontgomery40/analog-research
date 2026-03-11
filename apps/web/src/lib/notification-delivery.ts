/**
 * Notification Delivery Service
 *
 * Orchestrates delivery of notifications to configured channels.
 * Supports both Humans and ResearchAgents (Agents) as recipients.
 *
 * Channels: webhook, email, slack, discord
 */

import { createServiceClient } from '@/lib/supabase/server'
import { normalizeError } from '@/lib/errors'
import { logger } from '@/lib/logger'
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

const deliverNotificationLog = logger.withContext(
  'lib/notification-delivery.ts',
  'deliverNotification'
)
const deliverToChannelLog = logger.withContext(
  'lib/notification-delivery.ts',
  'deliverToChannel'
)
const logDeliveryLog = logger.withContext('lib/notification-delivery.ts', 'logDelivery')
const updateChannelStatsLog = logger.withContext(
  'lib/notification-delivery.ts',
  'updateChannelStats'
)
const sendTestNotificationLog = logger.withContext(
  'lib/notification-delivery.ts',
  'sendTestNotification'
)
const getChannelsForEntityLog = logger.withContext(
  'lib/notification-delivery.ts',
  'getChannelsForEntity'
)

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
    deliverNotificationLog.error(
      'Failed to fetch notification channels',
      {
        notificationId: notification.id,
        recipientType: notification.recipient_type,
        recipientId: notification.recipient_id,
      },
      normalizeError(error, {
        operatorHint: 'check notification_channels query',
      })
    )
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
          operatorHint: 'check channel_type config',
        }
    }
  } catch (error) {
    const normalized = normalizeError(error, {
      operatorHint: `check ${channel.channel_type} channel config`,
    })

    deliverToChannelLog.error(
      'Notification channel delivery failed',
      {
        notificationId: notification.id,
        channelId: channel.id,
        channelType: channel.channel_type,
      },
      normalized
    )

    return {
      success: false,
      error: normalized.message,
      operatorHint: normalized.operatorHint,
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
    logDeliveryLog.error(
      'Failed to persist notification delivery log',
      {
        notificationId,
        channelId,
        status: result.success ? 'delivered' : 'failed',
      },
      normalizeError(error, {
        operatorHint: 'check delivery_log insert',
      })
    )
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
      updateChannelStatsLog.warn('Channel delivery-count RPC unavailable, using row fallback', {
        channelId,
        operatorHint: 'check channel stats RPC',
        rpc: 'increment_channel_delivery_count',
      })

      // Best-effort fallback if the RPC is missing/unavailable.
      const { data: channel, error: channelError } = await serviceClient
        .from('notification_channels')
        .select('delivery_count')
        .eq('id', channelId)
        .maybeSingle()

      if (channelError) {
        updateChannelStatsLog.error(
          'Failed to load channel stats fallback row',
          {
            channelId,
            rpc: 'increment_channel_delivery_count',
          },
          normalizeError(channelError, {
            operatorHint: 'check channel stats fallback',
          })
        )
        return
      }

      if (!channel) {
        updateChannelStatsLog.warn('Missing channel row during stats fallback', {
          channelId,
          operatorHint: 'check notification_channels row',
          rpc: 'increment_channel_delivery_count',
        })
        return
      }

      const { error: updateError } = await serviceClient
        .from('notification_channels')
        .update({
          delivery_count: Number(channel.delivery_count || 0) + 1,
          last_delivered_at: nowIso,
          last_error: null,
        } as never)
        .eq('id', channelId)

      if (updateError) {
        updateChannelStatsLog.error(
          'Failed to update channel delivery stats fallback',
          {
            channelId,
            rpc: 'increment_channel_delivery_count',
          },
          normalizeError(updateError, {
            operatorHint: 'check channel stats fallback',
          })
        )
      }
    }
  } else {
    const { error } = await serviceClient.rpc('increment_channel_failure_count', {
      p_channel_id: channelId,
      p_error: result.error,
    })
    if (error) {
      updateChannelStatsLog.warn('Channel failure-count RPC unavailable, using row fallback', {
        channelId,
        operatorHint: 'check channel stats RPC',
        rpc: 'increment_channel_failure_count',
      })

      // Best-effort fallback if the RPC is missing/unavailable.
      const { data: channel, error: channelError } = await serviceClient
        .from('notification_channels')
        .select('failure_count')
        .eq('id', channelId)
        .maybeSingle()

      if (channelError) {
        updateChannelStatsLog.error(
          'Failed to load channel failure stats fallback row',
          {
            channelId,
            rpc: 'increment_channel_failure_count',
          },
          normalizeError(channelError, {
            operatorHint: 'check channel stats fallback',
          })
        )
        return
      }

      if (!channel) {
        updateChannelStatsLog.warn('Missing channel row during failure stats fallback', {
          channelId,
          operatorHint: 'check notification_channels row',
          rpc: 'increment_channel_failure_count',
        })
        return
      }

      const { error: updateError } = await serviceClient
        .from('notification_channels')
        .update({
          failure_count: Number(channel.failure_count || 0) + 1,
          last_error: result.error ?? null,
        } as never)
        .eq('id', channelId)

      if (updateError) {
        updateChannelStatsLog.error(
          'Failed to update channel failure stats fallback',
          {
            channelId,
            rpc: 'increment_channel_failure_count',
          },
          normalizeError(updateError, {
            operatorHint: 'check channel stats fallback',
          })
        )
      }
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
    sendTestNotificationLog.warn('Test notification channel not found', {
      channelId,
      operatorHint: 'check notification_channels row',
    })
    return {
      success: false,
      error: 'Channel not found',
      operatorHint: 'check notification_channels row',
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
    getChannelsForEntityLog.error(
      'Failed to load notification channels for entity',
      {
        entityType,
        entityId,
      },
      normalizeError(error, {
        operatorHint: 'check notification_channels query',
      })
    )
    return []
  }

  return (channels ?? []) as NotificationChannel[]
}
