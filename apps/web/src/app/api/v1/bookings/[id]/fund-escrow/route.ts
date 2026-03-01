import { NextRequest, NextResponse } from 'next/server'
import { requireBookingOwnerWriteAccess } from '@/lib/booking-owner-auth'
import { createEscrowCheckoutSession } from '@/lib/stripe'
import {
  createCryptoEscrowPaymentLink,
  getConfiguredCoinbaseSupportedCurrencies,
  isCoinbaseCurrencySupported,
} from '@/lib/coinbase'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'
import { buildPricingBreakdown } from '@/lib/payments/pricing'
import { z } from 'zod'
import { resolveCanonicalAppOrigin } from '@/lib/app-origin'
import {
  calculateAgentDailySpendCents,
  evaluateMoneyPolicy,
  loadAgentToolPolicy,
  resolveToolPolicySourceFromHeaders,
  writeAgentToolAuditLogBestEffort,
} from '@/lib/tool-policy'

export const runtime = 'nodejs'

const fundEscrowSchema = z.object({
  payment_method: z.enum(['stripe', 'crypto']).optional().default('stripe'),
  return_url: z.string().url().optional(),
})

interface BookingData {
  id: string
  bounty_id: string | null
  title: string
  agent_id: string
  human_id: string
  amount: number
  currency: string
  platform_fee: number
  payer_amount: number
  processor_fee: number
  status: string
  escrow_status: string
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  stripe_checkout_url: string | null
  coinbase_payment_link_id: string | null
  coinbase_payment_link_url: string | null
  payment_method: 'stripe' | 'crypto' | null
  bounties: {
    preferred_payment_method: 'stripe' | 'crypto' | null
  }[]
  humans: {
    id: string
    name: string
    stripe_account_id: string | null
    stripe_onboarding_complete: boolean
    wallet_address: string | null
  }[]
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/bookings/[id]/fund-escrow/route.ts', 'POST')
  const { id: bookingId } = await params

  const authResult = await requireBookingOwnerWriteAccess(request)
  if (authResult.errorResponse || !authResult.context) {
    return authResult.errorResponse as NextResponse
  }

  const { serviceClient, actingAgentId } = authResult.context
  const authMode = authResult.context.authMode
  const toolSource = resolveToolPolicySourceFromHeaders(request.headers)

  // Check if payments are paused (DB flag or env vars).
  const { isPaymentsPaused } = await import('@/lib/payments/pause-config')
  const pauseCheck = await isPaymentsPaused(serviceClient)
  if (pauseCheck.paused) {
    log.warn('Escrow funding blocked by payments pause', { bookingId })
    return NextResponse.json(
      { success: false, error: pauseCheck.reason || 'Payments are temporarily paused.' },
      { status: 503 }
    )
  }

  let paymentMethod: 'stripe' | 'crypto' = 'stripe'
  let returnUrl: string | undefined

  try {
    const rawBody = await request.text()
    if (rawBody) {
      const parsedBody = fundEscrowSchema.safeParse(JSON.parse(rawBody))
      if (!parsedBody.success) {
        return NextResponse.json(
          { success: false, error: parsedBody.error.errors },
          { status: 400 }
        )
      }
      paymentMethod = parsedBody.data.payment_method
      returnUrl = parsedBody.data.return_url
    }
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    )
  }

  // Get booking with human's Stripe account info
  const { data: bookingData, error: bookingError } = await serviceClient
    .from('bookings')
    .select(`
      id,
      bounty_id,
      title,
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
      stripe_checkout_session_id,
      stripe_checkout_url,
      coinbase_payment_link_id,
      coinbase_payment_link_url,
      humans(id, name, stripe_account_id, stripe_onboarding_complete, wallet_address),
      bounties(preferred_payment_method)
    `)
    .eq('id', bookingId)
    .single()

  const fetchResult = handleSingleResult(bookingData, bookingError, log, 'Booking', { bookingId })
  if (fetchResult.response) return fetchResult.response

  const booking = fetchResult.data as BookingData

  if (!booking.humans || booking.humans.length === 0) {
    log.error('Booking query missing humans join', { bookingId })
    return NextResponse.json({ success: false, error: 'Failed to load booking owner details' }, { status: 500 })
  }

  const human = booking.humans[0]

  // Verify ownership
  if (!actingAgentId || booking.agent_id !== actingAgentId) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    )
  }

  // Check if booking is in valid state for funding
  if (booking.escrow_status !== 'pending') {
    return NextResponse.json(
      { success: false, error: `Booking escrow is already ${booking.escrow_status}` },
      { status: 400 }
    )
  }

  if (booking.status !== 'pending') {
    return NextResponse.json(
      { success: false, error: `Booking is already ${booking.status}` },
      { status: 400 }
    )
  }

  const bountyPreferredPaymentMethod = booking.bounties?.[0]?.preferred_payment_method || null
  if (bountyPreferredPaymentMethod && paymentMethod !== bountyPreferredPaymentMethod) {
    return NextResponse.json(
      {
        success: false,
        error: `This booking requires ${bountyPreferredPaymentMethod} funding based on bounty payment rail.`,
      },
      { status: 409 }
    )
  }

  if (authMode === 'agent') {
    const policy = await loadAgentToolPolicy(serviceClient, actingAgentId)
    const payerAmount = booking.payer_amount > 0
      ? booking.payer_amount
      : booking.amount + (booking.processor_fee || 0)

    let dailySpendCents: number | undefined
    try {
      dailySpendCents = await calculateAgentDailySpendCents(serviceClient, actingAgentId)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await writeAgentToolAuditLogBestEffort(serviceClient, {
        agentId: actingAgentId,
        toolName: 'fund_escrow',
        decision: 'blocked',
        reasonCode: 'MONEY_DAILY_SPEND_UNAVAILABLE',
        reason: 'Action blocked by tool policy: unable to compute daily spend.',
        amountCents: payerAmount,
        source: toolSource,
        metadata: { booking_id: bookingId, error: reason },
      })

      return NextResponse.json(
        { success: false, error: 'Action blocked by tool policy: unable to compute daily spend.', code: 'TOOL_POLICY_BLOCKED' },
        { status: 403 }
      )
    }

    const decision = evaluateMoneyPolicy({
      policy,
      amountCents: payerAmount,
      enforceDailyCap: true,
      dailySpendCents,
    })

    if (!decision.allowed) {
      await writeAgentToolAuditLogBestEffort(serviceClient, {
        agentId: actingAgentId,
        toolName: 'fund_escrow',
        decision: 'blocked',
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        amountCents: payerAmount,
        source: toolSource,
        metadata: { booking_id: bookingId, payment_method: paymentMethod, daily_spend_cents: dailySpendCents },
      })

      return NextResponse.json(
        { success: false, error: decision.reason, code: 'TOOL_POLICY_BLOCKED' },
        { status: 403 }
      )
    }

    if (toolSource === 'api') {
      await writeAgentToolAuditLogBestEffort(serviceClient, {
        agentId: actingAgentId,
        toolName: 'fund_escrow',
        decision: 'allowed',
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        amountCents: payerAmount,
        source: toolSource,
        metadata: { booking_id: bookingId, payment_method: paymentMethod, daily_spend_cents: dailySpendCents },
      })
    }
  }

  const hasStripeSession = Boolean(booking.stripe_checkout_session_id || booking.stripe_checkout_url)
  const hasCryptoLink = Boolean(booking.coinbase_payment_link_id || booking.coinbase_payment_link_url)

  if (hasStripeSession || hasCryptoLink) {
    const existingMethod: 'stripe' | 'crypto' = hasCryptoLink ? 'crypto' : 'stripe'
    if (existingMethod !== paymentMethod) {
      return NextResponse.json(
        {
          success: false,
          error: `Escrow already has an active ${existingMethod} funding session for this booking.`,
        },
        { status: 409 }
      )
    }

    const existingPricing = buildPricingBreakdown(booking.amount, booking.currency, existingMethod)
    const platformFeeCents = booking.platform_fee > 0
      ? booking.platform_fee
      : existingPricing.platform_fee_cents
    const processorFeeCents = booking.processor_fee > 0
      ? booking.processor_fee
      : existingPricing.processor_fee_cents
    const payerTotalCents = booking.payer_amount > 0
      ? booking.payer_amount
      : booking.amount + processorFeeCents
    const humanPayoutCents = Math.max(booking.amount - platformFeeCents, 0)

    if (existingMethod === 'crypto') {
      if (!booking.coinbase_payment_link_url) {
        log.warn('Booking has crypto link id without URL; refusing duplicate link creation', { bookingId })
        return NextResponse.json(
          {
            success: false,
            error: 'Booking has an existing crypto funding link without URL. Please contact support.',
          },
          { status: 409 }
        )
      }

      return NextResponse.json({
        success: true,
        data: {
          payment_method: 'crypto',
          payment_link_id: booking.coinbase_payment_link_id,
          payment_link_url: booking.coinbase_payment_link_url,
          crypto_payment_url: booking.coinbase_payment_link_url,
          platform_fee_cents: platformFeeCents,
          processor_fee_cents: processorFeeCents,
          payer_total_cents: payerTotalCents,
          human_payout_cents: humanPayoutCents,
          subtotal_cents: booking.amount,
          currency: booking.currency,
          idempotent: true,
        },
      })
    }

    if (!booking.stripe_checkout_url) {
      log.warn('Booking has Stripe session id without URL; refusing duplicate session creation', { bookingId })
      return NextResponse.json(
        {
          success: false,
          error: 'Booking has an existing Stripe checkout session without URL. Please contact support.',
        },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        payment_method: 'stripe',
        checkout_session_id: booking.stripe_checkout_session_id,
        checkout_url: booking.stripe_checkout_url,
        platform_fee_cents: platformFeeCents,
        processor_fee_cents: processorFeeCents,
        payer_total_cents: payerTotalCents,
        human_payout_cents: humanPayoutCents,
        subtotal_cents: booking.amount,
        currency: booking.currency,
        idempotent: true,
      },
    })
  }

  try {
    const pricing = buildPricingBreakdown(booking.amount, booking.currency, paymentMethod)
    const appBaseUrl = resolveCanonicalAppOrigin(request.nextUrl.origin)
    const defaultReturnPath = booking.bounty_id ? `/dashboard/bounties/${booking.bounty_id}` : '/dashboard'
    const defaultReturnUrl = `${appBaseUrl}${defaultReturnPath}`

    const selectedReturnUrl = (() => {
      if (!returnUrl) {
        return defaultReturnUrl
      }

      try {
        const parsedDefaultUrl = new URL(defaultReturnUrl)
        const parsedRequestedUrl = new URL(returnUrl)
        if (parsedRequestedUrl.origin !== parsedDefaultUrl.origin) {
          return defaultReturnUrl
        }
      } catch {
        return defaultReturnUrl
      }

      return returnUrl
    })()

    if (paymentMethod === 'crypto') {
      const feeReceiverAddress = process.env.COINBASE_COMMERCE_FEE_RECEIVER

      if (!feeReceiverAddress) {
        return NextResponse.json(
          { success: false, error: 'COINBASE_COMMERCE_FEE_RECEIVER is not configured' },
          { status: 503 }
        )
      }

      if (!human.wallet_address) {
        return NextResponse.json(
          { success: false, error: 'Human does not have a crypto wallet address configured' },
          { status: 400 }
        )
      }

      if (!isCoinbaseCurrencySupported(booking.currency)) {
        const supported = getConfiguredCoinbaseSupportedCurrencies()
        return NextResponse.json(
          {
            success: false,
            error: `Booking currency ${booking.currency} is not supported for crypto settlement. Supported: ${supported.join(', ')}`,
          },
          { status: 400 }
        )
      }

      const paymentLink = await createCryptoEscrowPaymentLink({
        bookingId: booking.id,
        title: booking.title || `Escrow for booking ${booking.id}`,
        description: `Escrow funding for booking ${booking.id} on Analog Research`,
        amountCents: booking.amount,
        currency: booking.currency,
        receiverAddress: human.wallet_address,
        feeReceiverAddress,
      })

      const { error: bookingUpdateError } = await serviceClient
        .from('bookings')
        .update({
          payment_method: 'crypto',
          platform_fee: pricing.platform_fee_cents,
          processor_fee: pricing.processor_fee_cents,
          payer_amount: pricing.payer_total_cents,
          coinbase_payment_link_id: paymentLink.id,
          coinbase_payment_link_url: paymentLink.url,
          stripe_payment_intent_id: null,
          stripe_checkout_session_id: null,
          stripe_checkout_url: null,
          coinbase_payment_id: null,
        })
        .eq('id', bookingId)

      if (bookingUpdateError) {
        log.error('Failed to update booking for crypto funding', { bookingId }, { message: bookingUpdateError.message, code: bookingUpdateError.code })
        return NextResponse.json({ success: false, error: 'Failed to update booking for crypto funding' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        data: {
          payment_method: 'crypto',
          payment_link_id: paymentLink.id,
          payment_link_url: paymentLink.url,
          crypto_payment_url: paymentLink.url,
          platform_fee_cents: pricing.platform_fee_cents,
          processor_fee_cents: pricing.processor_fee_cents,
          payer_total_cents: pricing.payer_total_cents,
          human_payout_cents: pricing.human_payout_cents,
          subtotal_cents: pricing.subtotal_cents,
          currency: pricing.currency,
        },
      })
    }

    // Get human's Stripe account ID if they have one
    const humanStripeAccountId = human.stripe_onboarding_complete
      ? human.stripe_account_id ?? undefined
      : undefined

    const successUrl = (() => {
      const parsed = new URL(selectedReturnUrl)
      parsed.searchParams.set('escrow', 'stripe-pending')
      parsed.searchParams.set('booking_id', booking.id)
      return parsed.toString()
    })()

    const cancelUrl = (() => {
      const parsed = new URL(selectedReturnUrl)
      parsed.searchParams.set('escrow', 'stripe-cancelled')
      parsed.searchParams.set('booking_id', booking.id)
      return parsed.toString()
    })()

    const checkoutSession = await createEscrowCheckoutSession({
      pricing,
      agentId: booking.agent_id,
      bookingId: booking.id,
      bookingTitle: booking.title,
      successUrl,
      cancelUrl,
      humanStripeAccountId,
    })

    if (!checkoutSession.url) {
      throw new Error('Stripe checkout session did not include a redirect URL')
    }

    const sessionPaymentIntent = checkoutSession.payment_intent
    const paymentIntentId = typeof sessionPaymentIntent === 'string'
      ? sessionPaymentIntent
      : sessionPaymentIntent?.id

    // Update booking with payment intent ID
    const { error: bookingUpdateError } = await serviceClient
      .from('bookings')
      .update({
        stripe_payment_intent_id: paymentIntentId ?? booking.stripe_payment_intent_id,
        payment_method: 'stripe',
        platform_fee: pricing.platform_fee_cents,
        processor_fee: pricing.processor_fee_cents,
        payer_amount: pricing.payer_total_cents,
        stripe_checkout_session_id: checkoutSession.id,
        stripe_checkout_url: checkoutSession.url,
        coinbase_payment_link_id: null,
        coinbase_payment_link_url: null,
        coinbase_payment_id: null,
      })
      .eq('id', bookingId)

    if (bookingUpdateError) {
      log.error('Failed to update booking for Stripe funding', { bookingId }, { message: bookingUpdateError.message, code: bookingUpdateError.code })
      return NextResponse.json({ success: false, error: 'Failed to update booking for Stripe funding' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: {
        payment_method: 'stripe',
        checkout_session_id: checkoutSession.id,
        checkout_url: checkoutSession.url,
        platform_fee_cents: pricing.platform_fee_cents,
        processor_fee_cents: pricing.processor_fee_cents,
        payer_total_cents: pricing.payer_total_cents,
        human_payout_cents: pricing.human_payout_cents,
        subtotal_cents: pricing.subtotal_cents,
        currency: pricing.currency,
      },
    })
  } catch (error) {
    log.error('Failed to create escrow funding session', { bookingId }, error instanceof Error ? error : { message: String(error) })
    return NextResponse.json(
      { success: false, error: 'Failed to create escrow funding session' },
      { status: 500 }
    )
  }
}
