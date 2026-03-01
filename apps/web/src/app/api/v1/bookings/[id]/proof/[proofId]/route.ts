import { NextRequest, NextResponse } from 'next/server'
import { requireBookingOwnerWriteAccess } from '@/lib/booking-owner-auth'
import { HumanStripeOnboardingRequiredError, releaseEscrowAndTransfer, refundEscrow } from '@/lib/stripe'
import { captureCryptoEscrowPayment, getCoinbaseTransactionHash, voidCryptoEscrowPayment } from '@/lib/coinbase'
import { ensureBookingSettlementRecords } from '@/lib/booking-settlement'
import { calculateHumanPayoutCents } from '@/lib/payments/pricing'
import { recomputeQualityForBountyBestEffort } from '@/lib/quality-score-recompute'
import { logger } from '@/lib/logger'
import { handleSingleResult, logOnError } from '@/lib/supabase/errors'
import {
  evaluateMoneyPolicy,
  loadAgentToolPolicy,
  resolveToolPolicySourceFromHeaders,
  writeAgentToolAuditLogBestEffort,
} from '@/lib/tool-policy'
import { z } from 'zod'

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
  payment_method: 'stripe' | 'crypto' | null
  stripe_payment_intent_id: string | null
  coinbase_payment_id: string | null
  humans: HumanData[]
}

interface ProofData {
  id: string
  hours_worked: number
  status: string
}

const reviewProofSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; proofId: string }> }
) {
  const log = logger.withContext('api/v1/bookings/[id]/proof/[proofId]/route.ts', 'PATCH')
  const { id: bookingId, proofId } = await params
  const completionDisabled = process.env.DISABLE_BOOKING_COMPLETION === 'true'

  const auth = await requireBookingOwnerWriteAccess(request)
  if (auth.errorResponse || !auth.context) {
    return auth.errorResponse as NextResponse
  }
  const { actingAgentId, serviceClient: supabase, authMode } = auth.context
  const toolSource = resolveToolPolicySourceFromHeaders(request.headers)

  // Verify booking ownership
  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .select('id, bounty_id, agent_id, human_id, amount, currency, platform_fee, payer_amount, processor_fee, payment_method, stripe_payment_intent_id, coinbase_payment_id, humans(stripe_account_id, stripe_onboarding_complete)')
    .eq('id', bookingId)
    .single()

  const bookingResult = handleSingleResult(bookingData, bookingError, log, 'Booking', { bookingId })
  if (bookingResult.response) return bookingResult.response
  const booking = bookingResult.data as BookingData

  if (booking.agent_id !== actingAgentId) {
    log.warn('Forbidden: agent does not own booking', { agentId: actingAgentId, bookingId })
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = reviewProofSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  const targetStatus = parsed.data.approved ? 'approved' : 'rejected'

  const reconcileApprovedProof = async (
    hoursWorked: number,
    notifyHuman: boolean
  ): Promise<NextResponse | null> => {
    const { data: latestBookingData, error: latestBookingError } = await supabase
      .from('bookings')
      .select('id, bounty_id, agent_id, human_id, amount, currency, platform_fee, payer_amount, processor_fee, status, escrow_status, payment_method, stripe_payment_intent_id, coinbase_payment_id, humans(stripe_account_id, stripe_onboarding_complete)')
      .eq('id', bookingId)
      .single()

    if (latestBookingError) {
      log.error('Failed to fetch latest booking', { bookingId }, { message: latestBookingError.message, code: latestBookingError.code })
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    if (!latestBookingData) {
      log.warn('Latest booking not found', { bookingId })
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    const latestBooking = latestBookingData as BookingData & {
      status: string
      escrow_status: string
    }

    if (latestBooking.agent_id !== actingAgentId) {
      log.warn('Forbidden: agent does not own booking during reconciliation', { agentId: actingAgentId, bookingId })
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const paymentMethod = latestBooking.payment_method || 'stripe'
    const humanPayout = calculateHumanPayoutCents(latestBooking.amount)
    const payerAmount = latestBooking.payer_amount > 0
      ? latestBooking.payer_amount
      : latestBooking.amount + (latestBooking.processor_fee || 0)
    let cryptoTxHash: string | null = null

    const bookingNeedsCompletion = !(
      latestBooking.status === 'completed' && latestBooking.escrow_status === 'released'
    )

    if (bookingNeedsCompletion) {
      if (completionDisabled) {
        log.warn('Completion disabled during reconciliation; refusing to capture/release', { bookingId })
        return NextResponse.json(
          { success: false, error: 'Booking completion is temporarily disabled' },
          { status: 503 }
        )
      }

      if (paymentMethod === 'crypto') {
        if (!latestBooking.coinbase_payment_id) {
          return NextResponse.json({ success: false, error: 'Crypto escrow payment is not authorized yet' }, { status: 409 })
        }

        const captureResponse = await captureCryptoEscrowPayment({
          paymentId: latestBooking.coinbase_payment_id,
          amountCents: latestBooking.amount,
          currency: latestBooking.currency,
        })
        cryptoTxHash = getCoinbaseTransactionHash(captureResponse)
      } else {
        if (!latestBooking.stripe_payment_intent_id) {
          return NextResponse.json({ success: false, error: 'Stripe escrow payment is not authorized yet' }, { status: 409 })
        }
        const human = latestBooking.humans?.[0]
        try {
          await releaseEscrowAndTransfer({
            paymentIntentId: latestBooking.stripe_payment_intent_id,
            humanStripeAccountId: human?.stripe_account_id ?? null,
            humanStripeOnboardingComplete: human?.stripe_onboarding_complete ?? false,
            humanPayoutCents: humanPayout,
            currency: latestBooking.currency,
            bookingId,
          })
        } catch (error) {
          if (error instanceof HumanStripeOnboardingRequiredError) {
            return NextResponse.json(
              { success: false, error: error.message, code: error.code },
              { status: 409 }
            )
          }
          throw error
        }
      }

      const { data: transitionedBooking, error: bookingUpdateError } = await supabase
        .from('bookings')
        .update({
          status: 'completed',
          escrow_status: 'released',
          actual_hours: hoursWorked,
          completed_at: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .eq('status', 'submitted')
        .eq('escrow_status', 'funded')
        .select('id, status, escrow_status')
        .maybeSingle()

      if (bookingUpdateError) {
        log.error('Failed to update booking status during proof reconciliation', { bookingId }, { message: bookingUpdateError.message, code: bookingUpdateError.code })
      }

      if (!transitionedBooking || bookingUpdateError) {
        const { data: latestState, error: latestStateError } = await supabase
          .from('bookings')
          .select('status, escrow_status')
          .eq('id', bookingId)
          .maybeSingle()

        if (latestStateError) {
          log.error('Failed to fetch latest booking state after reconciliation failure', { bookingId }, { message: latestStateError.message, code: latestStateError.code })
        }

        if (latestState?.status === 'completed' && latestState?.escrow_status === 'released') {
          return null
        }

        if (paymentMethod === 'stripe' && latestBooking.stripe_payment_intent_id) {
          try {
            await refundEscrow(latestBooking.stripe_payment_intent_id)
            log.warn('Compensating refund succeeded after booking update failure', { bookingId })
          } catch (refundError) {
            log.error(
              'Compensating refund failed after booking update failure',
              { bookingId },
              refundError instanceof Error ? { message: refundError.message } : { message: String(refundError) }
            )
          }
        }

        if (paymentMethod === 'crypto' && latestBooking.coinbase_payment_id) {
          try {
            await voidCryptoEscrowPayment({
              paymentId: latestBooking.coinbase_payment_id,
              amountCents: latestBooking.amount,
              currency: latestBooking.currency,
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
    }

    try {
      await ensureBookingSettlementRecords(supabase, {
        bookingId,
        agentId: actingAgentId,
        humanId: latestBooking.human_id,
        amount: latestBooking.amount,
        platformFee: latestBooking.platform_fee,
        payerAmount,
        currency: latestBooking.currency,
        paymentMethod,
        cryptoTxHash,
        escrowReleaseDescription: 'Escrow released for completed work',
        platformFeeDescription: 'Platform fee (3%)',
      })
      await recomputeQualityForBountyBestEffort(supabase, latestBooking.bounty_id)
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to reconcile settlement records' },
        { status: 500 }
      )
    }

    if (notifyHuman) {
      await logOnError(
        supabase.from('notifications').insert({
          recipient_type: 'human' as const,
          recipient_id: latestBooking.human_id,
          type: 'proof_approved',
          title: 'Work approved!',
          body: `Your work has been approved. $${(humanPayout / 100).toFixed(2)} has been released.`,
          data: { booking_id: bookingId },
        }),
        log,
        'Create approval notification',
        { bookingId, humanId: latestBooking.human_id }
      )
    }

    return null
  }

  // Get proof
  const { data: proofData, error: proofError } = await supabase
    .from('proofs')
    .select('*')
    .eq('id', proofId)
    .eq('booking_id', bookingId)
    .single()

  const proofResult = handleSingleResult(proofData, proofError, log, 'Proof', { proofId, bookingId })
  if (proofResult.response) return proofResult.response
  const proof = proofResult.data as ProofData

  // Idempotent retries still reconcile side effects if a prior attempt failed mid-flight.
  if (proof.status === targetStatus) {
    if (targetStatus === 'approved') {
      const reconciliationError = await reconcileApprovedProof(proof.hours_worked, false)
      if (reconciliationError) {
        return reconciliationError
      }
    }
    return NextResponse.json({ success: true, data: proof })
  }

  if (completionDisabled && targetStatus === 'approved') {
    log.warn('Proof approval blocked: booking completion disabled', { bookingId, proofId })
    return NextResponse.json(
      { success: false, error: 'Booking completion is temporarily disabled' },
      { status: 503 }
    )
  }

  // Enforce pending-only transitions.
  if (proof.status !== 'pending') {
    return NextResponse.json({
      success: false,
      error: `Proof is already ${proof.status}`,
    }, { status: 409 })
  }

  if (authMode === 'agent' && parsed.data.approved) {
    const policy = await loadAgentToolPolicy(supabase, actingAgentId)
    const payerAmount = booking.payer_amount > 0
      ? booking.payer_amount
      : booking.amount + (booking.processor_fee || 0)

    const decision = evaluateMoneyPolicy({
      policy,
      amountCents: payerAmount,
      enforceDailyCap: false,
    })

    if (!decision.allowed) {
      await writeAgentToolAuditLogBestEffort(supabase, {
        agentId: actingAgentId,
        toolName: 'approve_work',
        decision: 'blocked',
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        amountCents: payerAmount,
        source: toolSource,
        metadata: { booking_id: bookingId, proof_id: proofId },
      })

      return NextResponse.json(
        { success: false, error: decision.reason, code: 'TOOL_POLICY_BLOCKED' },
        { status: 403 }
      )
    }

    if (toolSource === 'api') {
      await writeAgentToolAuditLogBestEffort(supabase, {
        agentId: actingAgentId,
        toolName: 'approve_work',
        decision: 'allowed',
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        amountCents: payerAmount,
        source: toolSource,
        metadata: { booking_id: bookingId, proof_id: proofId },
      })
    }
  }

  // Atomic state transition from pending -> target status.
  const proofUpdate = {
    status: targetStatus,
    feedback: parsed.data.feedback,
    reviewed_at: new Date().toISOString(),
  }
  const { data: transitionedProof, error } = await supabase
    .from('proofs')
    .update(proofUpdate)
    .eq('id', proofId)
    .eq('booking_id', bookingId)
    .eq('status', 'pending')
    .select()
    .maybeSingle()

  if (error) {
    log.error('Failed to update proof', { proofId, bookingId }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  if (!transitionedProof) {
    // Possible race; resolve to idempotent success if already transitioned.
    const { data: latestProofData, error: latestProofError } = await supabase
      .from('proofs')
      .select('*')
      .eq('id', proofId)
      .eq('booking_id', bookingId)
      .single()

    if (latestProofError || !latestProofData) {
      log.warn('Proof not found during race resolution', { proofId, bookingId, error: latestProofError?.message })
      return NextResponse.json({ success: false, error: 'Proof not found' }, { status: 404 })
    }

    const latest = latestProofData as ProofData

    if (latest.status === targetStatus) {
      if (targetStatus === 'approved') {
        const reconciliationError = await reconcileApprovedProof(latest.hours_worked, false)
        if (reconciliationError) {
          return reconciliationError
        }
      }
      return NextResponse.json({ success: true, data: latest })
    }

    return NextResponse.json({
      success: false,
      error: `Proof is already ${latest.status}`,
    }, { status: 409 })
  }

  if (parsed.data.approved) {
    const reconciliationError = await reconcileApprovedProof(transitionedProof.hours_worked, true)
    if (reconciliationError) {
      return reconciliationError
    }
  } else {
    // Update booking back to in_progress
    await logOnError(
      supabase.from('bookings').update({ status: 'in_progress' }).eq('id', bookingId),
      log,
      'Update booking status to in_progress',
      { bookingId }
    )

    // Notify human
    await logOnError(
      supabase.from('notifications').insert({
        recipient_type: 'human' as const,
        recipient_id: booking.human_id,
        type: 'proof_rejected',
        title: 'Revision requested',
        body: parsed.data.feedback || 'The agent has requested revisions to your work.',
        data: { booking_id: bookingId, proof_id: proofId },
      }),
      log,
      'Create rejection notification',
      { bookingId, humanId: booking.human_id }
    )
  }

  return NextResponse.json({ success: true, data: transitionedProof })
}
