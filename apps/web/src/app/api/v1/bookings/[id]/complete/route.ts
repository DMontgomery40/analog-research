import { NextRequest, NextResponse } from 'next/server'
import { requireBookingOwnerWriteAccess } from '@/lib/booking-owner-auth'
import { HumanStripeOnboardingRequiredError, releaseEscrowAndTransfer, refundEscrow, calculatePlatformFee, calculateHumanPayout } from '@/lib/stripe'
import { captureCryptoEscrowPayment, getCoinbaseTransactionHash, voidCryptoEscrowPayment } from '@/lib/coinbase'
import { ensureBookingSettlementRecords } from '@/lib/booking-settlement'
import { recomputeQualityForBountyBestEffort } from '@/lib/quality-score-recompute'
import { logger } from '@/lib/logger'
import { handleSingleResult, logOnError } from '@/lib/supabase/errors'
import {
  evaluateMoneyPolicy,
  loadAgentToolPolicy,
  resolveToolPolicySourceFromHeaders,
  writeAgentToolAuditLogBestEffort,
} from '@/lib/tool-policy'

export const runtime = 'nodejs'

interface HumanData {
  stripe_account_id: string | null
  stripe_onboarding_complete: boolean
}

interface BookingData {
  id: string
  bounty_id: string | null
  agent_id: string
  human_id: string
  amount: number
  currency: string
  platform_fee: number
  payer_amount: number
  processor_fee: number
  status: string
  escrow_status: string
  payment_method: 'stripe' | 'crypto' | null
  stripe_payment_intent_id: string | null
  coinbase_payment_id: string | null
  humans: HumanData[]
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/bookings/[id]/complete/route.ts', 'POST')
  const { id: bookingId } = await params
  const completionDisabled = process.env.DISABLE_BOOKING_COMPLETION === 'true'

  const authResult = await requireBookingOwnerWriteAccess(request)
  if (authResult.errorResponse || !authResult.context) {
    return authResult.errorResponse as NextResponse
  }

  const { serviceClient, actingAgentId, authMode } = authResult.context
  const toolSource = resolveToolPolicySourceFromHeaders(request.headers)

  // Get booking with human's Stripe account info
  const { data: bookingData, error: bookingError } = await serviceClient
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
      status,
      escrow_status,
      payment_method,
      stripe_payment_intent_id,
      coinbase_payment_id,
      humans(stripe_account_id, stripe_onboarding_complete)
    `)
    .eq('id', bookingId)
    .single()

  const fetchResult = handleSingleResult(bookingData, bookingError, log, 'Booking', { bookingId })
  if (fetchResult.response) return fetchResult.response

  const booking = fetchResult.data as BookingData

  // Only the booking owner agent can complete and release escrow.
  if (!actingAgentId || booking.agent_id !== actingAgentId) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    )
  }

  if (
    completionDisabled
    && !(booking.status === 'completed' && booking.escrow_status === 'released')
  ) {
    log.warn('Booking completion disabled by env flag', { bookingId })
    return NextResponse.json(
      { success: false, error: 'Booking completion is temporarily disabled' },
      { status: 503 }
    )
  }

  // Idempotent retries: if already released, reconcile missing side effects and return success.
  if (booking.status === 'completed' && booking.escrow_status === 'released') {
    const platformFee = calculatePlatformFee(booking.amount)
    const humanPayout = calculateHumanPayout(booking.amount)
    const paymentMethod = booking.payment_method || 'stripe'
    const payerAmount = booking.payer_amount > 0
      ? booking.payer_amount
      : booking.amount + (booking.processor_fee || 0)

    try {
      await ensureBookingSettlementRecords(serviceClient, {
        bookingId,
        agentId: booking.agent_id,
        humanId: booking.human_id,
        amount: booking.amount,
        platformFee,
        payerAmount,
        currency: booking.currency,
        paymentMethod,
        escrowReleaseDescription: 'Escrow released for completed work',
        platformFeeDescription: 'Platform fee (3%)',
      })
      await recomputeQualityForBountyBestEffort(serviceClient, booking.bounty_id)
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to reconcile settlement records' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        booking_id: bookingId,
        status: 'completed',
        amount: booking.amount,
        platform_fee: platformFee,
        human_payout: humanPayout,
      },
    })
  }

  // Check if booking is in valid state for completion
  if (booking.status !== 'submitted') {
    return NextResponse.json(
      { success: false, error: `Booking must be in 'submitted' status to complete. Current status: ${booking.status}` },
      { status: 400 }
    )
  }

  if (booking.escrow_status !== 'funded') {
    return NextResponse.json(
      { success: false, error: `Escrow must be funded to complete. Current status: ${booking.escrow_status}` },
      { status: 400 }
    )
  }

  if (authMode === 'agent') {
    const policy = await loadAgentToolPolicy(serviceClient, actingAgentId)
    const payerAmount = booking.payer_amount > 0
      ? booking.payer_amount
      : booking.amount + (booking.processor_fee || 0)

    const decision = evaluateMoneyPolicy({
      policy,
      amountCents: payerAmount,
      enforceDailyCap: false,
    })

    if (!decision.allowed) {
      await writeAgentToolAuditLogBestEffort(serviceClient, {
        agentId: actingAgentId,
        toolName: 'complete_booking',
        decision: 'blocked',
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        amountCents: payerAmount,
        source: toolSource,
        metadata: { booking_id: bookingId },
      })

      return NextResponse.json(
        { success: false, error: decision.reason, code: 'TOOL_POLICY_BLOCKED' },
        { status: 403 }
      )
    }

    if (toolSource === 'api') {
      await writeAgentToolAuditLogBestEffort(serviceClient, {
        agentId: actingAgentId,
        toolName: 'complete_booking',
        decision: 'allowed',
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        amountCents: payerAmount,
        source: toolSource,
        metadata: { booking_id: bookingId },
      })
    }
  }

  try {
    const platformFee = calculatePlatformFee(booking.amount)
    const humanPayout = calculateHumanPayout(booking.amount)
    const paymentMethod = booking.payment_method || 'stripe'
    const payerAmount = booking.payer_amount > 0
      ? booking.payer_amount
      : booking.amount + (booking.processor_fee || 0)
    let cryptoTxHash: string | null = null

    if (paymentMethod === 'crypto') {
      if (!booking.coinbase_payment_id) {
        return NextResponse.json(
          { success: false, error: 'Crypto escrow payment is not authorized yet' },
          { status: 409 }
        )
      }

      const captureResponse = await captureCryptoEscrowPayment({
        paymentId: booking.coinbase_payment_id,
        amountCents: booking.amount,
        currency: booking.currency,
      })
      cryptoTxHash = getCoinbaseTransactionHash(captureResponse)
    } else {
      if (!booking.stripe_payment_intent_id) {
        return NextResponse.json(
          { success: false, error: 'Stripe escrow payment is not authorized yet' },
          { status: 409 }
        )
      }

      // Capture the manually-authorized Stripe escrow payment and transfer to human.
      const human = booking.humans?.[0]
      await releaseEscrowAndTransfer({
        paymentIntentId: booking.stripe_payment_intent_id,
        humanStripeAccountId: human?.stripe_account_id ?? null,
        humanStripeOnboardingComplete: human?.stripe_onboarding_complete ?? false,
        humanPayoutCents: humanPayout,
        currency: booking.currency,
        bookingId,
      })
    }

    // Update booking status
    const { data: transitionedBooking, error: bookingUpdateError } = await serviceClient
      .from('bookings')
      .update({
        status: 'completed',
        escrow_status: 'released',
        completed_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('status', 'submitted')
      .eq('escrow_status', 'funded')
      .select('id, status, escrow_status')
      .maybeSingle()

    if (bookingUpdateError) {
      log.error('Failed to update booking status', { bookingId }, { message: bookingUpdateError.message, code: bookingUpdateError.code })
    }

    if (!transitionedBooking || bookingUpdateError) {
      // At this point, funds may already have been captured. Attempt best-effort compensation
      // unless another process already completed the booking.
      const { data: latestBookingData, error: latestBookingError } = await serviceClient
        .from('bookings')
        .select('status, escrow_status')
        .eq('id', bookingId)
        .maybeSingle()

      if (latestBookingError) {
        log.error('Failed to fetch latest booking after transition failure', { bookingId }, { message: latestBookingError.message, code: latestBookingError.code })
      }

      if (latestBookingData?.status === 'completed' && latestBookingData?.escrow_status === 'released') {
        try {
          await ensureBookingSettlementRecords(serviceClient, {
            bookingId,
            agentId: booking.agent_id,
            humanId: booking.human_id,
            amount: booking.amount,
            platformFee,
            payerAmount,
            currency: booking.currency,
            paymentMethod,
            cryptoTxHash,
            escrowReleaseDescription: 'Escrow released for completed work',
            platformFeeDescription: 'Platform fee (3%)',
          })
          await recomputeQualityForBountyBestEffort(serviceClient, booking.bounty_id)
        } catch (error) {
          return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to reconcile settlement records' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          data: {
            booking_id: bookingId,
            status: 'completed',
            amount: booking.amount,
            platform_fee: platformFee,
            human_payout: humanPayout,
          },
        })
      }

      if (paymentMethod === 'stripe' && booking.stripe_payment_intent_id) {
        try {
          await refundEscrow(booking.stripe_payment_intent_id)
          log.warn('Compensating refund succeeded after booking update failure', { bookingId })
        } catch (refundError) {
          log.error(
            'Compensating refund failed after booking update failure',
            { bookingId },
            refundError instanceof Error ? { message: refundError.message } : { message: String(refundError) }
          )
        }
      }

      if (paymentMethod === 'crypto' && booking.coinbase_payment_id) {
        try {
          await voidCryptoEscrowPayment({
            paymentId: booking.coinbase_payment_id,
            amountCents: booking.amount,
            currency: booking.currency,
          })
          log.warn('Compensating void succeeded after booking update failure', { bookingId })
        } catch (voidError) {
          log.error(
            'Compensating void failed after booking update failure',
            { bookingId },
            voidError instanceof Error ? { message: voidError.message } : { message: String(voidError) }
          )
        }
      }

      return NextResponse.json(
        { success: false, error: 'Failed to update booking status' },
        { status: 409 }
      )
    }

    await ensureBookingSettlementRecords(serviceClient, {
      bookingId,
      agentId: booking.agent_id,
      humanId: booking.human_id,
      amount: booking.amount,
      platformFee,
      payerAmount,
      currency: booking.currency,
      paymentMethod,
      cryptoTxHash,
      escrowReleaseDescription: 'Escrow released for completed work',
      platformFeeDescription: 'Platform fee (3%)',
    })

    // Notify human (non-blocking)
    await logOnError(
      serviceClient.from('notifications').insert({
        recipient_type: 'human',
        recipient_id: booking.human_id,
        type: 'proof_approved',
        title: 'Work completed and paid!',
        body: `Your work has been approved. $${(humanPayout / 100).toFixed(2)} has been released.`,
        data: { booking_id: bookingId },
      }),
      log,
      'Create completion notification',
      { bookingId, humanId: booking.human_id }
    )

    await recomputeQualityForBountyBestEffort(serviceClient, booking.bounty_id)

    log.info('Booking completed successfully', { bookingId, humanPayout, platformFee })

    return NextResponse.json({
      success: true,
      data: {
        booking_id: bookingId,
        status: 'completed',
        amount: booking.amount,
        platform_fee: platformFee,
        human_payout: humanPayout,
      },
    })
  } catch (error) {
    if (error instanceof HumanStripeOnboardingRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 409 }
      )
    }

    log.error('Failed to complete booking', { bookingId }, error instanceof Error ? error : { message: String(error) })
    return NextResponse.json(
      { success: false, error: 'Failed to complete booking' },
      { status: 500 }
    )
  }
}
