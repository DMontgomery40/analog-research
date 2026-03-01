import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

import { stripe } from '@/lib/stripe'
import { calculatePlatformFeeCents } from '@/lib/payments/pricing'
import { recomputeQualityForBountyBestEffort } from '@/lib/quality-score-recompute'
import { createServiceClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { acquireWebhookLock } from '@/lib/webhook-idempotency'

export const runtime = 'nodejs'

interface BookingWebhookRow {
  id: string
  bounty_id: string | null
  title: string
  status: string
  escrow_status: string
  agent_id: string
  human_id: string
  amount: number
  currency: string
}

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

async function markEscrowFundedFromPaymentIntent(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const log = logger.withContext('api/v1/webhooks/stripe/route.ts', 'markEscrowFundedFromPaymentIntent')
  const bookingId = paymentIntent.metadata.booking_id
  if (!bookingId) return

  const { data: bookingData, error: bookingFetchError } = await supabase
    .from('bookings')
    .select('id, bounty_id, title, status, escrow_status, agent_id, human_id, amount, currency')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingFetchError) {
    log.error('Failed to fetch booking', { bookingId }, { message: bookingFetchError.message, code: bookingFetchError.code })
    throw new Error(bookingFetchError.message)
  }

  const booking = bookingData as BookingWebhookRow | null
  if (!booking) return

  const payerTotalCents = paymentIntent.amount

  const expectedPlatformFeeCents = calculatePlatformFeeCents(booking.amount)
  const metadataPlatformFeeCents = parseNonNegativeInt(paymentIntent.metadata.platform_fee_cents)
  const platformFeeCents = metadataPlatformFeeCents != null
    && metadataPlatformFeeCents === expectedPlatformFeeCents
    ? metadataPlatformFeeCents
    : expectedPlatformFeeCents

  const processorFeeFromTotal = Math.max(0, payerTotalCents - booking.amount)
  const metadataProcessorFeeCents = parseNonNegativeInt(paymentIntent.metadata.processor_fee_cents)
  const processorFeeCents = metadataProcessorFeeCents != null
    && booking.amount + metadataProcessorFeeCents === payerTotalCents
    ? metadataProcessorFeeCents
    : processorFeeFromTotal

  // Atomically update payment metadata, transition escrow, insert transaction
  // and notification in a single DB round-trip.
  const { data: rpcResult, error: rpcError } = await supabase.rpc('mark_escrow_funded_atomic', {
    p_booking_id: bookingId,
    p_payment_method: 'stripe',
    p_stripe_payment_intent_id: paymentIntent.id,
    p_platform_fee: platformFeeCents,
    p_processor_fee: processorFeeCents,
    p_payer_amount: payerTotalCents,
    p_escrow_amount: paymentIntent.amount,
    p_currency: paymentIntent.currency?.toUpperCase() || 'USD',
    p_agent_id: paymentIntent.metadata.agent_id || booking.agent_id,
    p_human_id: booking.human_id,
    p_booking_title: booking.title,
  })

  if (rpcError) {
    throw new Error(rpcError.message)
  }

  const result = rpcResult?.[0]
  if (result?.transitioned) {
    try {
      await recomputeQualityForBountyBestEffort(supabase, booking.bounty_id)
    } catch (error) {
      log.error('Quality recompute failed (non-blocking)', { bookingId }, error instanceof Error ? { message: error.message } : { message: String(error) })
    }
  }
}

async function markEscrowDisputedFromPaymentIntent(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  paymentIntent: Stripe.PaymentIntent,
  details: { reason: string; stripeEventId: string }
): Promise<void> {
  const log = logger.withContext('api/v1/webhooks/stripe/route.ts', 'markEscrowDisputedFromPaymentIntent')
  const bookingId = paymentIntent.metadata.booking_id
  if (!bookingId) return

  const { data: bookingData, error: bookingFetchError } = await supabase
    .from('bookings')
    .select('id, status, escrow_status, agent_id, human_id, title')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingFetchError) {
    log.error('Failed to fetch booking for dispute handling', { bookingId }, { message: bookingFetchError.message, code: bookingFetchError.code })
    throw new Error(bookingFetchError.message)
  }

  const booking = bookingData as (BookingWebhookRow & { title?: string }) | null
  if (!booking) return

  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'disputed',
      escrow_status: 'disputed',
    })
    .eq('id', bookingId)

  if (updateError) {
    log.error('Failed to mark booking disputed', { bookingId }, { message: updateError.message, code: updateError.code })
    throw new Error(updateError.message)
  }

  // Notify both sides (best effort, do not fail webhook on notification errors).
  const baseData = { booking_id: bookingId, stripe_event_id: details.stripeEventId, reason: details.reason }
  const { error: notificationError } = await supabase.from('notifications').insert([
    {
      recipient_type: 'human',
      recipient_id: booking.human_id,
      type: 'dispute_opened',
      title: 'Payment dispute opened',
      body: 'A Stripe payment dispute was opened for this booking. Our team will review it.',
      data: baseData,
    },
    {
      recipient_type: 'agent',
      recipient_id: booking.agent_id,
      type: 'dispute_opened',
      title: 'Payment dispute opened',
      body: 'A Stripe payment dispute was opened for this booking. Our team will review it.',
      data: baseData,
    },
  ])

  if (notificationError) {
    log.error('Failed to notify parties about dispute (non-blocking)', { bookingId }, { message: notificationError.message, code: notificationError.code })
  }
}

async function markEscrowRefundedFromPaymentIntent(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  paymentIntent: Stripe.PaymentIntent,
  details: { stripeEventId: string }
): Promise<void> {
  const log = logger.withContext('api/v1/webhooks/stripe/route.ts', 'markEscrowRefundedFromPaymentIntent')
  const bookingId = paymentIntent.metadata.booking_id
  if (!bookingId) return

  const { data: bookingData, error: bookingFetchError } = await supabase
    .from('bookings')
    .select('id, status, escrow_status, agent_id, human_id, title')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingFetchError) {
    log.error('Failed to fetch booking for refund handling', { bookingId }, { message: bookingFetchError.message, code: bookingFetchError.code })
    throw new Error(bookingFetchError.message)
  }

  const booking = bookingData as (BookingWebhookRow & { title?: string }) | null
  if (!booking) return

  const newStatus = booking.status === 'completed' ? 'disputed' : 'cancelled'

  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: newStatus,
      escrow_status: 'refunded',
    })
    .eq('id', bookingId)

  if (updateError) {
    log.error('Failed to mark booking refunded', { bookingId }, { message: updateError.message, code: updateError.code })
    throw new Error(updateError.message)
  }

  const baseData = { booking_id: bookingId, stripe_event_id: details.stripeEventId }
  const { error: notificationError } = await supabase.from('notifications').insert([
    {
      recipient_type: 'human',
      recipient_id: booking.human_id,
      type: 'payment_refunded',
      title: 'Payment refunded',
      body: 'A Stripe refund was issued for this booking. If you believe this is incorrect, please contact support.',
      data: baseData,
    },
    {
      recipient_type: 'agent',
      recipient_id: booking.agent_id,
      type: 'payment_refunded',
      title: 'Payment refunded',
      body: 'A Stripe refund was issued for this booking. If you believe this is incorrect, please contact support.',
      data: baseData,
    },
  ])

  if (notificationError) {
    log.error('Failed to notify parties about refund (non-blocking)', { bookingId }, { message: notificationError.message, code: notificationError.code })
  }
}

async function markEscrowCanceledFromPaymentIntent(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const log = logger.withContext('api/v1/webhooks/stripe/route.ts', 'markEscrowCanceledFromPaymentIntent')
  const bookingId = paymentIntent.metadata.booking_id
  if (!bookingId) return

  const { data: bookingData, error: bookingFetchError } = await supabase
    .from('bookings')
    .select('id, status, escrow_status, stripe_payment_intent_id')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingFetchError) {
    log.error('Failed to fetch booking for cancel handling', { bookingId }, { message: bookingFetchError.message, code: bookingFetchError.code })
    throw new Error(bookingFetchError.message)
  }

  const booking = bookingData as { id: string; status: string; escrow_status: string; stripe_payment_intent_id: string | null } | null
  if (!booking) return

  // If escrow hasn't been funded yet, reset to pending and clear the payment intent reference.
  if (booking.escrow_status === 'pending') {
    const shouldClear = booking.stripe_payment_intent_id === paymentIntent.id
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        escrow_status: 'pending',
        status: booking.status === 'pending' ? 'pending' : booking.status,
        stripe_payment_intent_id: shouldClear ? null : booking.stripe_payment_intent_id,
      })
      .eq('id', bookingId)

    if (updateError) {
      log.error('Failed to reset booking after payment_intent.canceled', { bookingId }, { message: updateError.message, code: updateError.code })
      throw new Error(updateError.message)
    }

    return
  }

  // Cancellation after funding is unexpected; treat as disputed and alert via notifications best-effort.
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'disputed',
      escrow_status: 'disputed',
    })
    .eq('id', bookingId)

  if (updateError) {
    log.error('Failed to mark booking disputed after payment_intent.canceled', { bookingId }, { message: updateError.message, code: updateError.code })
    throw new Error(updateError.message)
  }
}

export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/webhooks/stripe/route.ts', 'POST')
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

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
    log.error('Webhook signature verification failed', {}, error instanceof Error ? { message: error.message } : { message: String(error) })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const lockResult = await acquireWebhookLock(supabase, 'stripe', event.id)
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
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const bookingId = session.metadata?.booking_id
        const sessionPaymentIntent = session.payment_intent
        const paymentIntentId = typeof sessionPaymentIntent === 'string'
          ? sessionPaymentIntent
          : sessionPaymentIntent?.id

        if (bookingId && paymentIntentId) {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
          const paymentIntentForBooking = {
            ...paymentIntent,
            metadata: {
              ...paymentIntent.metadata,
              booking_id: paymentIntent.metadata.booking_id || bookingId,
            },
          } as Stripe.PaymentIntent
          await markEscrowFundedFromPaymentIntent(supabase, paymentIntentForBooking)
        } else if (bookingId) {
          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              payment_method: 'stripe',
            })
            .eq('id', bookingId)

          if (updateError) {
            throw new Error(updateError.message)
          }
        }
        break
      }

      case 'payment_intent.amount_capturable_updated': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        await markEscrowFundedFromPaymentIntent(supabase, paymentIntent)
        break
      }

      case 'payment_intent.succeeded': {
        // Manual-capture escrow payments emit succeeded after capture.
        // We also call funded reconciliation as a compatibility fallback.
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        await markEscrowFundedFromPaymentIntent(supabase, paymentIntent)
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const bookingId = paymentIntent.metadata.booking_id
        const agentId = paymentIntent.metadata.agent_id

        if (bookingId && agentId) {
          const { error: notificationError } = await supabase.from('notifications').insert({
            recipient_type: 'agent',
            recipient_id: agentId,
            type: 'payment_failed',
            title: 'Payment failed',
            body: 'Your payment could not be processed. Please try again.',
            data: { booking_id: bookingId, stripe_event_id: event.id },
          })

          if (notificationError) {
            log.error('Failed to create payment_failed notification (non-blocking)', { bookingId }, { message: notificationError.message, code: notificationError.code })
          }
        }
        break
      }

      case 'payment_intent.canceled': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        await markEscrowCanceledFromPaymentIntent(supabase, paymentIntent)
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const chargePaymentIntent = charge.payment_intent
        const paymentIntentId = typeof chargePaymentIntent === 'string'
          ? chargePaymentIntent
          : chargePaymentIntent?.id

        if (paymentIntentId) {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
          await markEscrowRefundedFromPaymentIntent(supabase, paymentIntent, { stripeEventId: event.id })
        }
        break
      }

      case 'charge.dispute.created':
      case 'charge.dispute.updated': {
        const dispute = event.data.object as Stripe.Dispute
        const disputeCharge = dispute.charge
        const chargeId = typeof disputeCharge === 'string' ? disputeCharge : disputeCharge?.id

        if (chargeId) {
          const charge = await stripe.charges.retrieve(chargeId)
          const chargePaymentIntent = charge.payment_intent
          const paymentIntentId = typeof chargePaymentIntent === 'string'
            ? chargePaymentIntent
            : chargePaymentIntent?.id

          if (paymentIntentId) {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
            await markEscrowDisputedFromPaymentIntent(supabase, paymentIntent, {
              reason: dispute.reason || 'unknown',
              stripeEventId: event.id,
            })
          }
        }
        break
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const humanId = account.metadata?.human_id

        if (humanId) {
          const isComplete = Boolean(
            account.charges_enabled &&
            account.payouts_enabled &&
            account.details_submitted
          )

          const { error: updateError } = await supabase
            .from('humans')
            .update({
              stripe_onboarding_complete: isComplete,
            })
            .eq('id', humanId)

          if (updateError) {
            throw new Error(updateError.message)
          }
        }
        break
      }
    }

    await supabase
      .from('webhook_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('provider', 'stripe')
      .eq('event_id', event.id)

    return NextResponse.json({ received: true })
  } catch (error) {
    await supabase
      .from('webhook_events')
      .update({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown processing error',
      })
      .eq('provider', 'stripe')
      .eq('event_id', event.id)

    log.error('Webhook processing failed', { eventType: event.type, eventId: event.id }, error instanceof Error ? { message: error.message } : { message: String(error) })
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
