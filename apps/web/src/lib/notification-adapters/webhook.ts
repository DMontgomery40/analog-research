/**
 * Webhook delivery adapter
 * POSTs notification payload as JSON with optional HMAC signature
 */

import { createHmac } from 'crypto'
import type { NotificationPayload, WebhookConfig, DeliveryResult } from './types'
import { validateOutboundWebhookUrl } from '@/lib/webhook-url'

/**
 * Compute HMAC-SHA256 signature for webhook payload
 */
function computeSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Deliver notification to a webhook endpoint
 */
export async function deliverWebhook(
  notification: NotificationPayload,
  config: WebhookConfig
): Promise<DeliveryResult> {
  const urlResult = await validateOutboundWebhookUrl(config.url)
  if (!urlResult.ok) {
    return {
      success: false,
      error: `Unsafe webhook URL: ${urlResult.error}`,
    }
  }

  const payload = JSON.stringify({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    created_at: notification.created_at,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Analog Research-Notifications/1.0',
  }

  // Add HMAC signature if secret is configured
  if (config.secret) {
    headers['X-Signature-SHA256'] = computeSignature(payload, config.secret)
    headers['X-Signature-Timestamp'] = Date.now().toString()
  }

  try {
    const response = await fetch(urlResult.url.toString(), {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(10000), // 10 second timeout
      redirect: 'manual',
    })

    if (response.status >= 300 && response.status < 400) {
      return {
        success: false,
        error: `HTTP ${response.status}: Redirects are not allowed`,
        responseStatus: response.status,
      }
    }

    const responseBody = await response.text().catch(() => '')

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
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
