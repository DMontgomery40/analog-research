import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { acquireWebhookLock } from '@/lib/webhook-idempotency'

export const runtime = 'nodejs'

function isOnboardingComplete(account: Stripe.Account): boolean {
  // Mirror the same "ready" condition used elsewhere in the app.
  // This errs on the side of safety: we only mark complete when Stripe says the
  // connected account can receive payouts.
  return Boolean(account.charges_enabled && account.payouts_enabled && account.details_submitted)
}

export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/webhooks/stripe-connect/route.ts', 'POST')
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  if (!webhookSecret) {
    return NextResponse.json({ error: 'Missing webhook secret configuration' }, { status: 500 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error) {
    log.error(
      'Webhook signature verification failed',
      {},
      error instanceof Error ? { message: error.message } : { message: String(error) }
    )
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const lockResult = await acquireWebhookLock(supabase, 'stripe_connect', event.id)
  if (lockResult.action === 'skip_duplicate') {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (lockResult.action === 'error') {
    log.error('Failed to acquire webhook lock', {}, { message: lockResult.message })
    return NextResponse.json({ error: lockResult.message }, { status: lockResult.status })
  }
  // action === 'process' or 'retry' — continue processing

  try {
    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const onboardingComplete = isOnboardingComplete(account)
        const humanId = account.metadata?.human_id

        if (humanId) {
          const { error: updateError } = await supabase
            .from('humans')
            .update({
              stripe_onboarding_complete: onboardingComplete,
            })
            .eq('id', humanId)

          if (updateError) {
            throw new Error(updateError.message)
          }
        } else {
          // Backwards-compatible fallback for connected accounts created without metadata.
          const { error: updateError } = await supabase
            .from('humans')
            .update({
              stripe_onboarding_complete: onboardingComplete,
            })
            .eq('stripe_account_id', account.id)

          if (updateError) {
            throw new Error(updateError.message)
          }
        }
        break
      }

      default:
        log.info('Unhandled Stripe Connect webhook event', {
          eventType: event.type,
          eventId: event.id,
        })
        break
    }

    await supabase
      .from('webhook_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('provider', 'stripe_connect')
      .eq('event_id', event.id)

    return NextResponse.json({ received: true })
  } catch (error) {
    await supabase
      .from('webhook_events')
      .update({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown processing error',
      })
      .eq('provider', 'stripe_connect')
      .eq('event_id', event.id)

    log.error(
      'Webhook processing failed',
      { eventType: event.type, eventId: event.id },
      error instanceof Error ? { message: error.message } : { message: String(error) }
    )
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
