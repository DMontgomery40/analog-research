/**
 * Slack delivery adapter
 * Uses Slack Incoming Webhooks with Block Kit formatting
 */

import type { NotificationPayload, SlackConfig, DeliveryResult } from './types'
import { validateSlackWebhookUrl } from '@/lib/webhook-url'

/**
 * Deliver notification to Slack via incoming webhook
 */
export async function deliverSlack(
  notification: NotificationPayload,
  config: SlackConfig
): Promise<DeliveryResult> {
  const urlResult = await validateSlackWebhookUrl(config.webhook_url)
  if (!urlResult.ok) {
    return {
      success: false,
      error: `Unsafe Slack webhook URL: ${urlResult.error}`,
    }
  }

  const blocks = buildSlackBlocks(notification)

  try {
    const response = await fetch(urlResult.url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: notification.title, // Fallback for notifications
        blocks,
      }),
      signal: AbortSignal.timeout(10000),
      redirect: 'manual',
    })

    if (response.status >= 300 && response.status < 400) {
      return {
        success: false,
        error: `Slack webhook error: ${response.status} (redirect blocked)`,
        responseStatus: response.status,
      }
    }

    // Slack webhooks return "ok" on success
    const responseBody = await response.text().catch(() => '')

    if (!response.ok) {
      return {
        success: false,
        error: `Slack webhook error: ${response.status}`,
        responseStatus: response.status,
        responseBody,
      }
    }

    // Slack returns "ok" as plain text on success
    if (responseBody !== 'ok') {
      return {
        success: false,
        error: `Unexpected Slack response: ${responseBody}`,
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
 * Build Slack Block Kit blocks for notification
 * See: https://api.slack.com/block-kit
 */
function buildSlackBlocks(notification: NotificationPayload): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: truncate(notification.title, 150),
        emoji: true,
      },
    },
  ]

  if (notification.body) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncate(notification.body, 3000),
      },
    })
  }

  // Add context with notification type and timestamp
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `*Type:* ${formatNotificationType(notification.type)} | *Sent:* <!date^${Math.floor(new Date(notification.created_at).getTime() / 1000)}^{date_short_pretty} at {time}|${notification.created_at}>`,
      },
    ],
  })

  // Add action button to view in dashboard
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View in Analog Research',
          emoji: true,
        },
        url: 'https://analog-research.org/dashboard',
        action_id: 'view_notification',
      },
    ],
  })

  return blocks
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

// Slack Block Kit types (simplified)
interface SlackBlock {
  type: 'header' | 'section' | 'context' | 'actions' | 'divider'
  text?: {
    type: 'plain_text' | 'mrkdwn'
    text: string
    emoji?: boolean
  }
  elements?: Array<{
    type: 'mrkdwn' | 'button' | 'plain_text'
    text?: string | { type: 'plain_text'; text: string; emoji?: boolean }
    url?: string
    action_id?: string
  }>
}
