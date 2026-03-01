export const PLATFORM_FEE_BPS = (() => {
  const env = typeof process !== 'undefined' ? process.env : undefined
  const configured = clampInt(
    numberFromEnv(env?.COINBASE_COMMERCE_PLATFORM_FEE_BPS, 300),
    { min: 0, max: 10000 }
  )

  // Non-negotiable: platform fee is 3% of subtotal.
  if (configured !== 300) {
    throw new Error(`COINBASE_COMMERCE_PLATFORM_FEE_BPS must be 300 (got: ${configured})`)
  }

  return configured
})()

export type PaymentMethod = 'stripe' | 'crypto'

export type PricingBreakdown = {
  subtotal_cents: number
  currency: string
  platform_fee_cents: number
  processor_fee_cents: number
  payer_total_cents: number
  human_payout_cents: number
  // For Stripe destination charges: this must include both platform_fee + processor_fee.
  // For crypto, set equal to platform_fee_cents.
  stripe_application_fee_cents: number
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clampInt(value: number, { min, max }: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function uppercaseCurrency(currency: string): string {
  const normalized = (currency || '').trim().toUpperCase()
  return normalized || 'USD'
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer (got: ${value})`)
  }
}

function bigintToNumber(value: bigint): number {
  const asNumber = Number(value)
  if (!Number.isSafeInteger(asNumber)) {
    throw new Error('Value exceeds JS safe integer range')
  }
  return asNumber
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error('ceilDiv denominator must be positive')
  }
  return (numerator + denominator - 1n) / denominator
}

const env = typeof process !== 'undefined' ? process.env : undefined

export const STRIPE_PROCESSING_FEE_BPS_ESTIMATE = clampInt(
  numberFromEnv(env?.STRIPE_PROCESSING_FEE_BPS_ESTIMATE, 440),
  { min: 0, max: 9999 }
)

export const STRIPE_PROCESSING_FIXED_FEE_MINOR = clampInt(
  numberFromEnv(env?.STRIPE_PROCESSING_FIXED_FEE_MINOR, 30),
  { min: 0, max: 1000000 }
)

export const STRIPE_PROCESSING_FX_FEE_BPS_ESTIMATE = clampInt(
  numberFromEnv(env?.STRIPE_PROCESSING_FX_FEE_BPS_ESTIMATE, 100),
  { min: 0, max: 9999 }
)

export function calculatePlatformFeeCents(subtotalCents: number): number {
  assertNonNegativeInteger('subtotalCents', subtotalCents)
  const numerator = BigInt(subtotalCents) * BigInt(PLATFORM_FEE_BPS) + 5000n
  return bigintToNumber(numerator / 10000n)
}

export function calculateHumanPayoutCents(subtotalCents: number): number {
  assertNonNegativeInteger('subtotalCents', subtotalCents)
  return subtotalCents - calculatePlatformFeeCents(subtotalCents)
}

export function calculateStripeProcessingFeeCents(subtotalCents: number, currency: string): number {
  assertNonNegativeInteger('subtotalCents', subtotalCents)

  const normalizedCurrency = uppercaseCurrency(currency)
  const effectiveStripeFeeBps =
    STRIPE_PROCESSING_FEE_BPS_ESTIMATE +
    (normalizedCurrency !== 'USD' ? STRIPE_PROCESSING_FX_FEE_BPS_ESTIMATE : 0)

  const bps = BigInt(effectiveStripeFeeBps)
  const fixed = BigInt(STRIPE_PROCESSING_FIXED_FEE_MINOR)

  if (bps === 0n && fixed === 0n) {
    return 0
  }

  if (bps >= 10000n) {
    throw new Error(`Invalid Stripe fee config: effectiveStripeFeeBps must be < 10000 (got: ${effectiveStripeFeeBps})`)
  }

  // Gross-up so processor_fee covers Stripe's % + fixed fee applied to the TOTAL (subtotal + processor_fee).
  // We use ceil math and then validate/adjust so we never under-collect by 1 cent.
  const subtotal = BigInt(subtotalCents)
  const denom = 10000n - bps
  const numerator = subtotal * bps + fixed * 10000n
  let processorFee = ceilDiv(numerator, denom)

  const stripeFeeForTotal = (totalCents: bigint): bigint => {
    const percentFee = ceilDiv(totalCents * bps, 10000n)
    return percentFee + fixed
  }

  for (let i = 0; i < 8; i += 1) {
    const total = subtotal + processorFee
    const stripeFee = stripeFeeForTotal(total)
    if (processorFee >= stripeFee) {
      return bigintToNumber(processorFee)
    }
    processorFee = stripeFee
  }

  return bigintToNumber(processorFee)
}

export function buildPricingBreakdown(
  subtotalCents: number,
  currency: string,
  method: PaymentMethod
): PricingBreakdown {
  assertNonNegativeInteger('subtotalCents', subtotalCents)
  const normalizedCurrency = uppercaseCurrency(currency)

  const platformFee = calculatePlatformFeeCents(subtotalCents)
  const humanPayout = subtotalCents - platformFee

  if (method === 'crypto') {
    return {
      subtotal_cents: subtotalCents,
      currency: normalizedCurrency,
      platform_fee_cents: platformFee,
      processor_fee_cents: 0,
      payer_total_cents: subtotalCents,
      human_payout_cents: humanPayout,
      stripe_application_fee_cents: platformFee,
    }
  }

  const processorFee = calculateStripeProcessingFeeCents(subtotalCents, normalizedCurrency)
  return {
    subtotal_cents: subtotalCents,
    currency: normalizedCurrency,
    platform_fee_cents: platformFee,
    processor_fee_cents: processorFee,
    payer_total_cents: subtotalCents + processorFee,
    human_payout_cents: humanPayout,
    stripe_application_fee_cents: platformFee + processorFee,
  }
}
