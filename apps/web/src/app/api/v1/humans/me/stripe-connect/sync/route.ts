import { NextRequest, NextResponse } from 'next/server'

import { checkAccountStatus } from '@/lib/stripe'
import { logger } from '@/lib/logger'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { handleSingleResult } from '@/lib/supabase/errors'

export const runtime = 'nodejs'

interface StripeLikeError {
  message?: string
  code?: string
  param?: string
}

function toStripeLikeError(error: unknown): StripeLikeError | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as Record<string, unknown>
  return {
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    param: typeof candidate.param === 'string' ? candidate.param : undefined,
  }
}

function isMissingConnectedAccountError(error: unknown): boolean {
  const stripeError = toStripeLikeError(error)
  const message = stripeError?.message || ''
  return (
    (stripeError?.code === 'resource_missing' && stripeError?.param === 'account')
    || message.includes('No such account')
  )
}

export async function POST(_request: NextRequest) {
  const log = logger.withContext('api/v1/humans/me/stripe-connect/sync/route.ts', 'POST')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = await createServiceClient()
  const { data: humanData, error: humanError } = await serviceClient
    .from('humans')
    .select('id, stripe_account_id, stripe_onboarding_complete')
    .eq('user_id', user.id)
    .single()

  const humanResult = handleSingleResult(humanData, humanError, log, 'Human profile', { userId: user.id })
  if (humanResult.response) return humanResult.response
  const human = humanResult.data

  if (!human.stripe_account_id) {
    if (human.stripe_onboarding_complete) {
      const { error: updateError } = await serviceClient
        .from('humans')
        .update({ stripe_onboarding_complete: false })
        .eq('id', human.id)

      if (updateError) {
        log.error(
          'Failed to clear onboarding status for human without account',
          { humanId: human.id },
          { message: updateError.message, code: updateError.code }
        )
        return NextResponse.json({ success: false, error: 'Failed to sync Stripe status' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        account_id: null,
        stripe_onboarding_complete: false,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        updated: Boolean(human.stripe_onboarding_complete),
      },
    })
  }

  try {
    const { isComplete, account } = await checkAccountStatus(human.stripe_account_id)
    const shouldUpdate = Boolean(human.stripe_onboarding_complete) !== isComplete

    if (shouldUpdate) {
      const { error: updateError } = await serviceClient
        .from('humans')
        .update({ stripe_onboarding_complete: isComplete })
        .eq('id', human.id)

      if (updateError) {
        log.error(
          'Failed to update stripe onboarding status',
          { humanId: human.id, accountId: human.stripe_account_id },
          { message: updateError.message, code: updateError.code }
        )
        return NextResponse.json({ success: false, error: 'Failed to sync Stripe status' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        account_id: human.stripe_account_id,
        stripe_onboarding_complete: isComplete,
        charges_enabled: Boolean(account.charges_enabled),
        payouts_enabled: Boolean(account.payouts_enabled),
        details_submitted: Boolean(account.details_submitted),
        updated: shouldUpdate,
      },
    })
  } catch (error) {
    if (isMissingConnectedAccountError(error)) {
      const { error: updateError } = await serviceClient
        .from('humans')
        .update({ stripe_onboarding_complete: false })
        .eq('id', human.id)

      if (updateError) {
        log.error(
          'Failed to clear onboarding status after missing Stripe account',
          { humanId: human.id, accountId: human.stripe_account_id },
          { message: updateError.message, code: updateError.code }
        )
        return NextResponse.json({ success: false, error: 'Failed to sync Stripe status' }, { status: 500 })
      }

      log.warn('Stripe account missing during sync', {
        humanId: human.id,
        accountId: human.stripe_account_id,
      })

      return NextResponse.json({
        success: true,
        data: {
          account_id: null,
          stripe_onboarding_complete: false,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          updated: true,
        },
      })
    }

    log.error(
      'Failed to fetch Stripe account status',
      { humanId: human.id, accountId: human.stripe_account_id },
      error instanceof Error ? error : { message: String(error) }
    )
    return NextResponse.json({ success: false, error: 'Failed to sync Stripe status' }, { status: 500 })
  }
}
