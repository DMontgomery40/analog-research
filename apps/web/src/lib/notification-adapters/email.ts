/**
 * Email delivery adapter using Resend
 * Requires RESEND_API_KEY environment variable
 */

import type { NotificationPayload, EmailConfig, DeliveryResult } from './types'

const RESEND_API_KEY = process.env.RESEND_API_KEY

/**
 * Deliver notification via email using Resend API
 */
export async function deliverEmail(
  notification: NotificationPayload,
  config: EmailConfig
): Promise<DeliveryResult> {
  if (!RESEND_API_KEY) {
    return {
      success: false,
      error: 'RESEND_API_KEY not configured',
    }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Analog Research <notifications@analog-research.org>',
        to: config.address,
        subject: notification.title,
        text: formatPlainText(notification),
        html: formatHtml(notification),
      }),
      signal: AbortSignal.timeout(10000),
    })

    const responseBody = await response.text().catch(() => '')

    if (!response.ok) {
      return {
        success: false,
        error: `Resend API error: ${response.status}`,
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
 * Format notification as plain text email
 */
function formatPlainText(notification: NotificationPayload): string {
  let text = notification.title

  if (notification.body) {
    text += `\n\n${notification.body}`
  }

  text += `\n\n---\nView in Analog Research: https://analog-research.org/dashboard`

  return text
}

/**
 * Format notification as HTML email
 */
function formatHtml(notification: NotificationPayload): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px; }
    .title { font-size: 18px; font-weight: 600; color: #111; margin-bottom: 12px; }
    .body { font-size: 14px; color: #444; line-height: 1.5; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #888; }
    .button { display: inline-block; background: #7c3aed; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="title">${escapeHtml(notification.title)}</div>
    ${notification.body ? `<div class="body">${escapeHtml(notification.body)}</div>` : ''}
    <a href="https://analog-research.org/dashboard" class="button">View in Dashboard</a>
    <div class="footer">
      This notification was sent by Analog Research.
      <a href="https://analog-research.org/dashboard/settings">Manage preferences</a>
    </div>
  </div>
</body>
</html>
`.trim()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
