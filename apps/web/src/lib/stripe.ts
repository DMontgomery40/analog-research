import Stripe from 'stripe'

import type { PricingBreakdown } from '@/lib/payments/pricing'
import { calculateHumanPayoutCents, calculatePlatformFeeCents } from '@/lib/payments/pricing'

// Lazy-initialize Stripe to avoid errors during build when env vars aren't set
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim()
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }

    _stripe = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
    })
  }
  return _stripe
}

// Test-only helper to inject a Stripe client without requiring env config.
// Not used in production code paths.
export function setStripeClientForTesting(client: Stripe | null) {
  _stripe = client
}

// For backwards compatibility
export const stripe = {
  get paymentIntents() { return getStripe().paymentIntents },
  get charges() { return getStripe().charges },
  get refunds() { return getStripe().refunds },
  get accountLinks() { return getStripe().accountLinks },
  get accounts() { return getStripe().accounts },
  get checkout() { return getStripe().checkout },
  get transfers() { return getStripe().transfers },
  get webhooks() { return getStripe().webhooks },
}

export function calculatePlatformFee(amount: number): number {
  return calculatePlatformFeeCents(amount)
}

export function calculateHumanPayout(amount: number): number {
  return calculateHumanPayoutCents(amount)
}

function toStripeCurrency(currency: string): string {
  return currency.trim().toLowerCase()
}

function escrowIdempotencyKey(prefix: string, bookingId: string): string {
  // Stripe idempotency keys are scoped per endpoint and typically retained for 24 hours.
  // We keep this deterministic per booking to prevent duplicate sessions/intents on retries.
  return `al_${prefix}_${bookingId}`
}

function transferIdempotencyKey(bookingId: string): string {
  return `al_escrow_transfer_${bookingId}`
}

export class HumanStripeOnboardingRequiredError extends Error {
  readonly code = 'HUMAN_STRIPE_ONBOARDING_REQUIRED'

  constructor() {
    super('Human has not completed Stripe Connect onboarding. Cannot transfer payout.')
  }
}

// Create a payment intent for escrow (manual capture)
export async function createEscrowPayment(
  amount: number,
  currency: string,
  // `agentId` is the payer ResearchAgent id (legacy naming: agent).
  agentId: string,
  bookingId: string,
  humanStripeAccountId?: string
): Promise<Stripe.PaymentIntent> {
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency: toStripeCurrency(currency),
      capture_method: 'manual', // Don't capture immediately - hold in escrow
      metadata: {
        agent_id: agentId,
        booking_id: bookingId,
      },
      // If we have the human's connected account, set up transfer
      ...(humanStripeAccountId && {
        transfer_data: {
          destination: humanStripeAccountId,
        },
        application_fee_amount: calculatePlatformFee(amount),
      }),
    },
    { idempotencyKey: escrowIdempotencyKey('escrow_pi', bookingId) }
  )

  return paymentIntent
}

interface CreateEscrowCheckoutSessionInput {
  pricing: PricingBreakdown
  agentId: string
  bookingId: string
  bookingTitle: string
  successUrl: string
  cancelUrl: string
  humanStripeAccountId?: string
}

export async function createEscrowCheckoutSession(
  input: CreateEscrowCheckoutSessionInput
): Promise<Stripe.Checkout.Session> {
  const breakdown = input.pricing

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: toStripeCurrency(breakdown.currency),
        unit_amount: breakdown.subtotal_cents,
        product_data: {
          name: 'Booking subtotal',
          description: input.bookingTitle || `Escrow funding for booking ${input.bookingId} on Analog Research`,
        },
      },
    },
  ]

  if (breakdown.processor_fee_cents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: toStripeCurrency(breakdown.currency),
        unit_amount: breakdown.processor_fee_cents,
        product_data: {
          name: 'Processing fee',
          description: 'Card processing fee (paid by payer)',
        },
      },
    })
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: lineItems,
      metadata: {
        agent_id: input.agentId,
        booking_id: input.bookingId,
        booking_subtotal_cents: String(breakdown.subtotal_cents),
        platform_fee_cents: String(breakdown.platform_fee_cents),
        processor_fee_cents: String(breakdown.processor_fee_cents),
        payer_total_cents: String(breakdown.payer_total_cents),
        currency: breakdown.currency,
      },
      payment_intent_data: {
        capture_method: 'manual',
        metadata: {
          agent_id: input.agentId,
          booking_id: input.bookingId,
          booking_subtotal_cents: String(breakdown.subtotal_cents),
          platform_fee_cents: String(breakdown.platform_fee_cents),
          processor_fee_cents: String(breakdown.processor_fee_cents),
          payer_total_cents: String(breakdown.payer_total_cents),
          currency: breakdown.currency,
        },
        ...(input.humanStripeAccountId && {
          transfer_data: {
            destination: input.humanStripeAccountId,
          },
          application_fee_amount: breakdown.stripe_application_fee_cents,
        }),
      },
    },
    { idempotencyKey: escrowIdempotencyKey('escrow_cs', input.bookingId) }
  )

  return session
}

// Capture the payment and release escrow
export async function releaseEscrow(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

  if (paymentIntent.status === 'requires_capture') {
    return stripe.paymentIntents.capture(paymentIntentId)
  }

  if (paymentIntent.status === 'succeeded') {
    // Already captured (idempotent success).
    return paymentIntent
  }

  if (paymentIntent.status === 'canceled') {
    throw new Error('Escrow payment intent is canceled')
  }

  throw new Error(`Cannot capture escrow payment intent in status: ${paymentIntent.status}`)
}

// Cancel/refund the escrow
export async function refundEscrow(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

  // If we never captured, cancellation releases the hold.
  if (paymentIntent.status === 'requires_capture') {
    return stripe.paymentIntents.cancel(paymentIntentId)
  }

  // If it was already canceled, treat as idempotent.
  if (paymentIntent.status === 'canceled') {
    return paymentIntent
  }

  // If it was captured, we must refund.
  if (paymentIntent.status === 'succeeded') {
    await stripe.refunds.create({ payment_intent: paymentIntentId })
    return stripe.paymentIntents.retrieve(paymentIntentId)
  }

  // Unknown/unsupported state for refund/cancel (e.g., processing).
  throw new Error(`Cannot refund escrow payment intent in status: ${paymentIntent.status}`)
}

// Create Stripe Connect onboarding link for humans
export async function createConnectAccountLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string,
  type: 'account_onboarding' | 'account_update' = 'account_onboarding'
): Promise<Stripe.AccountLink> {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type,
  })

  return accountLink
}

export async function createConnectLoginLink(
  accountId: string
): Promise<Stripe.LoginLink> {
  return stripe.accounts.createLoginLink(accountId)
}

// Create a new Stripe Connect account for a human
export async function createConnectAccount(
  email: string,
  humanId: string
): Promise<Stripe.Account> {
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    metadata: {
      human_id: humanId,
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  })

  return account
}

// Check if a connected account is fully onboarded
export async function checkAccountStatus(
  accountId: string
): Promise<{ isComplete: boolean; account: Stripe.Account }> {
  const account = await stripe.accounts.retrieve(accountId)

  const isComplete = Boolean(
    account.charges_enabled &&
    account.payouts_enabled &&
    account.details_submitted
  )

  return { isComplete, account }
}

// Transfer funds to a connected account (for manual transfers)
export async function transferToHuman(
  amount: number,
  currency: string,
  humanStripeAccountId: string,
  bookingId: string,
  sourceTransaction?: string,
  idempotencyKey?: string
): Promise<Stripe.Transfer> {
  const transfer = await stripe.transfers.create(
    {
      amount,
      currency: toStripeCurrency(currency),
      destination: humanStripeAccountId,
      ...(sourceTransaction && { source_transaction: sourceTransaction }),
      metadata: {
        booking_id: bookingId,
      },
    },
    idempotencyKey ? { idempotencyKey } : undefined
  )

  return transfer
}

// Capture escrow and ensure the human gets paid.
// If the PaymentIntent was created with transfer_data (human was onboarded at
// funding time), Stripe auto-transfers on capture. Otherwise we issue a
// separate transfer using the charge ID from the captured intent.
export interface ReleaseAndTransferParams {
  paymentIntentId: string
  humanStripeAccountId: string | null
  humanStripeOnboardingComplete: boolean
  humanPayoutCents: number
  currency: string
  bookingId: string
}

export interface ReleaseAndTransferResult {
  paymentIntent: Stripe.PaymentIntent
  transferId: string | null
}

export async function releaseEscrowAndTransfer(
  params: ReleaseAndTransferParams
): Promise<ReleaseAndTransferResult> {
  const pi = await stripe.paymentIntents.retrieve(params.paymentIntentId)
  const usesAutomaticTransfer = Boolean(pi.transfer_data?.destination)

  // Guard before capture: if this intent needs manual transfer and the human is not
  // payout-ready, never capture funds.
  if (
    pi.status === 'requires_capture'
    && !usesAutomaticTransfer
    && (!params.humanStripeAccountId || !params.humanStripeOnboardingComplete)
  ) {
    throw new HumanStripeOnboardingRequiredError()
  }

  // Capture
  let captured: Stripe.PaymentIntent
  if (pi.status === 'requires_capture') {
    captured = await stripe.paymentIntents.capture(params.paymentIntentId)
  } else if (pi.status === 'succeeded') {
    captured = pi // already captured (idempotent)
  } else if (pi.status === 'canceled') {
    throw new Error('Escrow payment intent is canceled')
  } else {
    throw new Error(`Cannot capture escrow payment intent in status: ${pi.status}`)
  }

  // If transfer_data was set at checkout, Stripe auto-transfers on capture.
  if (captured.transfer_data?.destination) {
    return { paymentIntent: captured, transferId: null }
  }

  // No automatic transfer — we must send funds to the human manually.
  if (!params.humanStripeAccountId || !params.humanStripeOnboardingComplete) {
    throw new HumanStripeOnboardingRequiredError()
  }

  const chargeId = typeof captured.latest_charge === 'string'
    ? captured.latest_charge
    : captured.latest_charge?.id ?? undefined

  const transfer = await transferToHuman(
    params.humanPayoutCents,
    params.currency,
    params.humanStripeAccountId,
    params.bookingId,
    chargeId,
    transferIdempotencyKey(params.bookingId)
  )

  return { paymentIntent: captured, transferId: transfer.id }
}
