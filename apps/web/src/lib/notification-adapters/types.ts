/**
 * Shared types for notification delivery adapters
 */

export interface NotificationPayload {
  id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  created_at: string
  recipient_type: 'human' | 'agent'
  recipient_id: string
}

export interface WebhookConfig {
  url: string
  secret?: string
}

export interface EmailConfig {
  address: string
}

export interface SlackConfig {
  webhook_url: string
}

export interface DiscordConfig {
  webhook_url: string
}

export type ChannelConfig = WebhookConfig | EmailConfig | SlackConfig | DiscordConfig

export interface DeliveryResult {
  success: boolean
  error?: string
  operatorHint?: string
  responseStatus?: number
  responseBody?: string
}
