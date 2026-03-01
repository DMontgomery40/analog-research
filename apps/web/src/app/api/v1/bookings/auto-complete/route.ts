import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { HumanStripeOnboardingRequiredError, releaseEscrowAndTransfer, refundEscrow, calculatePlatformFee, calculateHumanPayout } from '@/lib/stripe'
import { logger } from '@/lib/logger'
import { captureCryptoEscrowPayment, getCoinbaseTransactionHash, voidCryptoEscrowPayment } from '@/lib/coinbase'
import { ensureBookingSettlementRecords } from '@/lib/booking-settlement'
import { recomputeQualityForBountyBestEffort } from '@/lib/quality-score-recompute'

export const runtime = 'nodejs'

/**
 * Auto-complete endpoint for bookings that have been in 'submitted' status for 72 hours.
 * This can be called by:
 * - Netlify scheduled functions (cron)
 * - An external scheduler like Upstash QStash
 * - Manual trigger for testing
 *
 * Security: Requires Authorization: Bearer <CRON_SECRET>
 */
const log = logger.withContext('api/v1/bookings/auto-complete/route.ts', 'POST')

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const completionDisabled = process.env.DISABLE_BOOKING_COMPLETION === 'true'

  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET is not configured' },
      { status: 503 }
    )
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  if (completionDisabled) {
    return NextResponse.json(
      { success: false, error: 'Booking completion is temporarily disabled' },
      { status: 503 }
    )
  }

  const supabase = await createServiceClient()

  // Find bookings in 'submitted' status for more than 72 hours
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()

  const { data: bookings, error: fetchError } = await supabase
    .from('bookings')
    .select(`
      id,
      bounty_id,
      agent_id,
      human_id,
      amount,
      currency,
      platform_fee,
      payer_amount,
      processor_fee,
      payment_method,
      submitted_at,
      stripe_payment_intent_id,
      coinbase_payment_id,
      humans(id, name, stripe_account_id, stripe_onboarding_complete)
    `)
    .eq('status', 'submitted')
    .eq('escrow_status', 'funded')
    .not('submitted_at', 'is', null)
    .lt('submitted_at', seventyTwoHoursAgo)

  if (fetchError) {
    log.error('Error fetching bookings for auto-complete', {}, { message: fetchError.message, code: fetchError.code })
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    )
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({
      success: true,
      data: { processed: 0, message: 'No bookings to auto-complete' },
    })
  }

  interface ProcessedBooking {
    id: string
    status: 'completed' | 'error'
    error?: string
  }

  const results: ProcessedBooking[] = []

  for (const booking of bookings) {
    try {
      const platformFee = calculatePlatformFee(booking.amount)
      const humanPayout = calculateHumanPayout(booking.amount)
      const paymentMethod = booking.payment_method
      if (!paymentMethod) {
        throw new Error('Booking payment method is missing')
      }
      const payerAmount = booking.payer_amount > 0
        ? booking.payer_amount
        : booking.amount + (booking.processor_fee || 0)
      let cryptoTxHash: string | null = null

      if (paymentMethod === 'crypto') {
        if (!booking.coinbase_payment_id) {
          throw new Error('Crypto escrow payment is not authorized yet')
        }

        const captureResponse = await captureCryptoEscrowPayment({
          paymentId: booking.coinbase_payment_id,
          amountCents: booking.amount,
          currency: booking.currency,
        })
        cryptoTxHash = getCoinbaseTransactionHash(captureResponse)
      } else {
        if (!booking.stripe_payment_intent_id) {
          throw new Error('Stripe escrow payment is not authorized yet')
        }

        // Capture escrow and transfer payout to the human.
        const humanArr = booking.humans as { id: string; name: string; stripe_account_id: string | null; stripe_onboarding_complete: boolean }[] | null
        const human = humanArr?.[0] ?? null
        await releaseEscrowAndTransfer({
          paymentIntentId: booking.stripe_payment_intent_id,
          humanStripeAccountId: human?.stripe_account_id ?? null,
          humanStripeOnboardingComplete: human?.stripe_onboarding_complete ?? false,
          humanPayoutCents: humanPayout,
          currency: booking.currency,
          bookingId: booking.id,
        })
      }

      // Update booking status
      const { data: transitionedBooking, error: bookingUpdateError } = await supabase
        .from('bookings')
        .update({
          status: 'completed',
          escrow_status: 'released',
          completed_at: new Date().toISOString(),
        })
        .eq('id', booking.id)
        .eq('status', 'submitted')
        .eq('escrow_status', 'funded')
        .select('id, status, escrow_status')
        .maybeSingle()

      if (bookingUpdateError || !transitionedBooking) {
        const { data: latestState, error: latestStateError } = await supabase
          .from('bookings')
          .select('status, escrow_status')
          .eq('id', booking.id)
          .maybeSingle()

        if (latestStateError) {
          log.error('Failed to fetch latest booking state after auto-complete failure', { bookingId: booking.id }, { message: latestStateError.message, code: latestStateError.code })
        }

        if (latestState?.status === 'completed' && latestState?.escrow_status === 'released') {
          await ensureBookingSettlementRecords(supabase, {
            bookingId: booking.id,
            agentId: booking.agent_id,
            humanId: booking.human_id,
            amount: booking.amount,
            platformFee,
            payerAmount,
            currency: booking.currency,
            paymentMethod,
            cryptoTxHash,
            escrowReleaseDescription: 'Escrow auto-released after 72 hours',
            platformFeeDescription: 'Platform fee (3%)',
          })
          await recomputeQualityForBountyBestEffort(supabase, booking.bounty_id)
          results.push({ id: booking.id, status: 'completed' })
          continue
        }

        if (paymentMethod === 'stripe' && booking.stripe_payment_intent_id) {
          try {
            await refundEscrow(booking.stripe_payment_intent_id)
            log.warn('Compensating refund succeeded after auto-complete failure', { bookingId: booking.id })
          } catch (refundError) {
            log.error('Compensating refund failed after auto-complete failure', { bookingId: booking.id }, refundError instanceof Error ? { message: refundError.message } : { message: String(refundError) })
          }
        }

        if (paymentMethod === 'crypto' && booking.coinbase_payment_id) {
          try {
            await voidCryptoEscrowPayment({
              paymentId: booking.coinbase_payment_id,
              amountCents: booking.amount,
              currency: booking.currency,
            })
            log.warn('Compensating void succeeded after auto-complete failure', { bookingId: booking.id })
          } catch (voidError) {
            log.error('Compensating void failed after auto-complete failure', { bookingId: booking.id }, voidError instanceof Error ? { message: voidError.message } : { message: String(voidError) })
          }
        }

        throw new Error('Failed to update booking status')
      }

      await ensureBookingSettlementRecords(supabase, {
        bookingId: booking.id,
        agentId: booking.agent_id,
        humanId: booking.human_id,
        amount: booking.amount,
        platformFee,
        payerAmount,
        currency: booking.currency,
        paymentMethod,
        cryptoTxHash,
        escrowReleaseDescription: 'Escrow auto-released after 72 hours',
        platformFeeDescription: 'Platform fee (3%)',
      })

      await recomputeQualityForBountyBestEffort(supabase, booking.bounty_id)

      // Notify both parties
      await supabase.from('notifications').insert([
        {
          recipient_type: 'human',
          recipient_id: booking.human_id,
          type: 'proof_approved',
          title: 'Work auto-completed!',
          body: `Your work was automatically approved after 72 hours. $${(humanPayout / 100).toFixed(2)} has been released.`,
          data: { booking_id: booking.id },
        },
        {
          recipient_type: 'agent',
          recipient_id: booking.agent_id,
          type: 'proof_approved',
          title: 'Booking auto-completed',
          body: `Booking was automatically completed after 72 hours without review.`,
          data: { booking_id: booking.id },
        },
      ])

      results.push({ id: booking.id, status: 'completed' })
    } catch (err) {
      if (err instanceof HumanStripeOnboardingRequiredError) {
        results.push({
          id: booking.id,
          status: 'error',
          error: err.code,
        })
        continue
      }

      log.error('Error auto-completing booking', { bookingId: booking.id }, err instanceof Error ? err : { message: String(err) })
      results.push({
        id: booking.id,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      processed: results.length,
      results,
    },
  })
}
