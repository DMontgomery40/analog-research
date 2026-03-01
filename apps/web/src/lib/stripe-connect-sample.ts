import Stripe from 'stripe'

import { resolveCanonicalAppOrigin } from '@/lib/app-origin'

let stripeClientSingleton: Stripe | null = null

export const CONNECT_SAMPLE_PRODUCT_ACCOUNT_METADATA_KEY = 'connect_sample_account_id'

function requireEnvValue(name: string, placeholder: string): string {
  const value = (process.env[name] || '').trim()
  if (!value) {
    throw new Error(
      `Missing ${name}. Add ${name}=${placeholder} to apps/web/.env.local before using Stripe Connect sample routes.`
    )
  }
  return value
}

export function isConnectSampleEnabled(): boolean {
  return (process.env.STRIPE_CONNECT_SAMPLE_ENABLED || '').trim().toLowerCase() === 'true'
}

export function assertConnectSampleEnabled() {
  if (!isConnectSampleEnabled()) {
    throw new Error(
      'Stripe Connect sample is disabled. Set STRIPE_CONNECT_SAMPLE_ENABLED=true in apps/web/.env.local to enable /admin/connect-sample and /connect-sample routes.'
    )
  }
}

export function getConnectSampleStripeClient(): Stripe {
  assertConnectSampleEnabled()

  if (!stripeClientSingleton) {
    // Placeholder: set STRIPE_SECRET_KEY=sk_*** in apps/web/.env.local.
    const secretKey = requireEnvValue('STRIPE_SECRET_KEY', 'sk_***')

    if (!secretKey.startsWith('sk_')) {
      throw new Error('Invalid STRIPE_SECRET_KEY format. Expected a Stripe secret key that starts with sk_.')
    }

    // Per Stripe guidance for this sample, rely on the SDK default API version.
    const stripeClient = new Stripe(secretKey)
    stripeClientSingleton = stripeClient
  }

  return stripeClientSingleton
}

export function getConnectSampleWebhookSecret(): string {
  // Placeholder: set STRIPE_CONNECT_SAMPLE_WEBHOOK_SECRET=whsec_*** for this specific webhook endpoint.
  const webhookSecret = requireEnvValue('STRIPE_CONNECT_SAMPLE_WEBHOOK_SECRET', 'whsec_***')
  if (!webhookSecret.startsWith('whsec_')) {
    throw new Error(
      'Invalid STRIPE_CONNECT_SAMPLE_WEBHOOK_SECRET format. Expected a Stripe webhook signing secret that starts with whsec_. '
      + 'Create one in Stripe Dashboard > Developers > Webhooks for /api/v1/webhooks/stripe-connect-sample.'
    )
  }
  return webhookSecret
}

export function getConnectSampleAppOrigin(requestOrigin: string): string {
  const explicit = (process.env.STRIPE_CONNECT_SAMPLE_APP_URL || '').trim()
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }

  return resolveCanonicalAppOrigin(requestOrigin)
}

export interface ConnectSampleAccountStatus {
  readyToReceivePayments: boolean
  onboardingComplete: boolean
  requirementsStatus: string | null
  stripeTransfersStatus: string | null
}

export function deriveConnectSampleAccountStatus(account: Stripe.V2.Core.Account): ConnectSampleAccountStatus {
  const stripeTransfersStatus = account.configuration
    ?.recipient
    ?.capabilities
    ?.stripe_balance
    ?.stripe_transfers
    ?.status || null

  const requirementsStatus = account.requirements?.summary?.minimum_deadline?.status || null

  const onboardingComplete = requirementsStatus !== 'currently_due' && requirementsStatus !== 'past_due'
  const readyToReceivePayments = stripeTransfersStatus === 'active'

  return {
    readyToReceivePayments,
    onboardingComplete,
    requirementsStatus,
    stripeTransfersStatus,
  }
}

export function isMissingConnectSampleTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { code?: string; message?: string }
  const message = (candidate.message || '').toLowerCase()

  return (
    candidate.code === '42P01'
    || candidate.code === 'PGRST205'
    || message.includes('stripe_connect_sample_accounts')
  )
}

export function getConnectSampleMissingTableErrorMessage(): string {
  return (
    'Stripe Connect sample table is missing. Apply migration 047_stripe_connect_sample_accounts.sql, '
    + 'then retry the request.'
  )
}
