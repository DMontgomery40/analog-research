import { describe, expect, it } from 'vitest'

import { buildPricingBreakdown } from '@/lib/payments/pricing'

describe('payments pricing', () => {
  it('buildPricingBreakdown (stripe) produces a payer-paid processor fee and correct allocations', () => {
    const pricing = buildPricingBreakdown(10000, 'USD', 'stripe')

    expect(pricing.subtotal_cents).toBe(10000)
    expect(pricing.processor_fee_cents).toBeGreaterThan(0)
    expect(pricing.payer_total_cents).toBe(pricing.subtotal_cents + pricing.processor_fee_cents)
    expect(pricing.stripe_application_fee_cents).toBe(pricing.platform_fee_cents + pricing.processor_fee_cents)
    expect(pricing.human_payout_cents).toBe(pricing.subtotal_cents - pricing.platform_fee_cents)
  })

  it('buildPricingBreakdown (crypto) does not add a processor fee to the payer total', () => {
    const pricing = buildPricingBreakdown(10000, 'USD', 'crypto')

    expect(pricing.subtotal_cents).toBe(10000)
    expect(pricing.processor_fee_cents).toBe(0)
    expect(pricing.payer_total_cents).toBe(pricing.subtotal_cents)
    expect(pricing.human_payout_cents).toBe(pricing.subtotal_cents - pricing.platform_fee_cents)
  })
})

