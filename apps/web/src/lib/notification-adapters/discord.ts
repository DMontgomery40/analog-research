/**
 * Discord delivery adapter
 * Uses Discord Webhooks with embed formatting
 */

import type { NotificationPayload, DiscordConfig, DeliveryResult } from './types'
import { validateDiscordWebhookUrl } from '@/lib/webhook-url'

// Analog Research purple
const EMBED_COLOR = 0x7c3aed

/**
 * Deliver notification to Discord via webhook
 */
export async function deliverDiscord(
  notification: NotificationPayload,
  config: DiscordConfig
): Promise<DeliveryResult> {
  const urlResult = await validateDiscordWebhookUrl(config.webhook_url)
  if (!urlResult.ok) {
    return {
      success: false,
      error: `Unsafe Discord webhook URL: ${urlResult.error}`,
    }
  }

  const embed = buildDiscordEmbed(notification)

  try {
    const response = await fetch(urlResult.url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'Analog Research',
        avatar_url: 'https://analog-research.org/logo.png',
        embeds: [embed],
      }),
      signal: AbortSignal.timeout(10000),
      redirect: 'manual',
    })

    if (response.status >= 300 && response.status < 400) {
      return {
        success: false,
        error: `Discord webhook error: ${response.status} (redirect blocked)`,
        responseStatus: response.status,
      }
    }

    // Discord returns 204 No Content on success
    const responseBody = await response.text().catch(() => '')

    if (!response.ok) {
      return {
        success: false,
        error: `Discord webhook error: ${response.status}`,
        responseStatus: response.status,
        responseBody,
      }
    }

    return {
      success: true,
      responseStatus: response.status,
      responseBody,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Build Discord embed for notification
 * See: https://discord.com/developers/docs/resources/webhook#execute-webhook
 */
function buildDiscordEmbed(notification: NotificationPayload): DiscordEmbed {
  const embed: DiscordEmbed = {
    title: truncate(notification.title, 256),
    color: EMBED_COLOR,
    timestamp: notification.created_at,
    footer: {
      text: `Type: ${formatNotificationType(notification.type)}`,
    },
  }

  if (notification.body) {
    embed.description = truncate(notification.body, 4096)
  }

  // Add fields for important data if present
  const fields: DiscordField[] = []

  if (notification.data.bounty_id) {
    fields.push({
      name: 'Bounty',
      value: `[View Bounty](https://analog-research.org/bounties/${notification.data.bounty_id})`,
      inline: true,
    })
  }

  if (notification.data.booking_id) {
    fields.push({
      name: 'Booking',
      value: `[View Booking](https://analog-research.org/dashboard/bookings/${notification.data.booking_id})`,
      inline: true,
    })
  }

  if (notification.data.conversation_id) {
    const conversationPath = notification.recipient_type === 'agent'
      ? `/dashboard/molty-messages/${notification.data.conversation_id}`
      : `/dashboard/conversations/${notification.data.conversation_id}`
    fields.push({
      name: 'Message',
      value: `[View Conversation](https://analog-research.org${conversationPath})`,
      inline: true,
    })
  }

  if (fields.length > 0) {
    embed.fields = fields
  }

  return embed
}

/**
 * Format notification type for display
 */
function formatNotificationType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Truncate string to max length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

// Discord embed types
interface DiscordEmbed {
  title: string
  description?: string
  color: number
  timestamp: string
  footer?: {
    text: string
    icon_url?: string
  }
  fields?: DiscordField[]
}

interface DiscordField {
  name: string
  value: string
  inline?: boolean
}
