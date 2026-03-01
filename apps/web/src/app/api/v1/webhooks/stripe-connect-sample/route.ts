import { NextRequest, NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import {
  deriveConnectSampleAccountStatus,
  getConnectSampleStripeClient,
  getConnectSampleWebhookSecret,
} from '@/lib/stripe-connect-sample'

export const runtime = 'nodejs'

async function handleAccountRequirementsUpdated(event: unknown, stripeAccountId: string) {
  const stripeClient = getConnectSampleStripeClient()
  const account = await stripeClient.v2.core.accounts.retrieve(stripeAccountId, {
    include: ['configuration.recipient', 'requirements'],
  })

  const status = deriveConnectSampleAccountStatus(account)

  logger.info('Stripe Connect sample requirements updated', {
    eventType: (event as { type?: string }).type,
    stripeAccountId,
    requirementsStatus: status.requirementsStatus,
    readyToReceivePayments: status.readyToReceivePayments,
  })
}

async function handleRecipientCapabilityStatusUpdated(event: unknown, stripeAccountId: string) {
  const stripeClient = getConnectSampleStripeClient()
  const account = await stripeClient.v2.core.accounts.retrieve(stripeAccountId, {
    include: ['configuration.recipient', 'requirements'],
  })

  const status = deriveConnectSampleAccountStatus(account)

  logger.info('Stripe Connect sample recipient capability status updated', {
    eventType: (event as { type?: string }).type,
    stripeAccountId,
    stripeTransfersStatus: status.stripeTransfersStatus,
    readyToReceivePayments: status.readyToReceivePayments,
  })
}

export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/webhooks/stripe-connect-sample/route.ts', 'POST')

  let stripeClient
  let webhookSecret
  try {
    stripeClient = getConnectSampleStripeClient()
    webhookSecret = getConnectSampleWebhookSecret()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 }
    )
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ success: false, error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // Stripe signature verification must use the raw body exactly as received.
  const rawBody = await request.text()

  let eventNotification
  try {
    // Latest Stripe SDK: parse thin event notifications with parseEventNotification.
    eventNotification = stripeClient.parseEventNotification(rawBody, signature, webhookSecret)
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid webhook signature',
    }, { status: 400 })
  }

  try {
    // Fetch full event payload from the v2 Events API using the thin notification id.
    const event = await stripeClient.v2.core.events.retrieve(eventNotification.id)

    const relatedObjectId = (event as { related_object?: { id?: string } }).related_object?.id || null

    switch (event.type) {
      case 'v2.core.account[requirements].updated':
        if (relatedObjectId) {
          await handleAccountRequirementsUpdated(event, relatedObjectId)
        }
        break

      case 'v2.core.account[configuration.recipient].capability_status_updated':
        if (relatedObjectId) {
          await handleRecipientCapabilityStatusUpdated(event, relatedObjectId)
        }
        break

      default:
        log.info('Unhandled Stripe Connect sample webhook event', {
          type: event.type,
          eventId: event.id,
        })
        break
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process Stripe event notification' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true })
}
