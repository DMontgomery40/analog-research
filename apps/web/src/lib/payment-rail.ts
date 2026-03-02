export type PaymentRail = 'stripe' | 'crypto' | null | undefined

export function formatPaymentRailLabel(
  paymentRail: PaymentRail,
  fallback = 'chosen when escrow is funded'
): string {
  if (paymentRail === 'stripe') return 'Stripe'
  if (paymentRail === 'crypto') return 'Coinbase'
  return fallback
}
