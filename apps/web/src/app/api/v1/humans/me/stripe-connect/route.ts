import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createConnectAccount, createConnectAccountLink, createConnectLoginLink } from '@/lib/stripe'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'
import { resolveCanonicalAppOrigin } from '@/lib/app-origin'

export const runtime = 'nodejs'

interface StripeLikeError {
  message?: string
  code?: string
  param?: string
}

const stripeConnectActionSchema = z.object({
  action: z.enum(['setup', 'manage']).optional().default('setup'),
})

type StripeConnectAction = z.infer<typeof stripeConnectActionSchema>['action']

function toStripeLikeError(error: unknown): StripeLikeError | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as Record<string, unknown>
  return {
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    param: typeof candidate.param === 'string' ? candidate.param : undefined,
  }
}

function isStripeConnectNotEnabledError(error: unknown): boolean {
  const stripeError = toStripeLikeError(error)
  const message = stripeError?.message || ''
  return message.includes('signed up for Connect')
}

function isMissingConnectedAccountError(error: unknown): boolean {
  const stripeError = toStripeLikeError(error)
  const message = stripeError?.message || ''
  return (
    (stripeError?.code === 'resource_missing' && stripeError?.param === 'account')
    || message.includes('No such account')
  )
}

function isUnsupportedAccountUpdateLinkError(error: unknown): boolean {
  const stripeError = toStripeLikeError(error)
  const message = (stripeError?.message || '').toLowerCase()
  return message.includes('account_update')
    && message.includes('stripe-hosted dashboard')
}

export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/humans/me/stripe-connect/route.ts', 'POST')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const authenticatedUser = user

  const serviceClient = await createServiceClient()

  const { data: humanData, error: humanError } = await serviceClient
    .from('humans')
    .select('id, stripe_account_id, stripe_onboarding_complete')
    .eq('user_id', authenticatedUser.id)
    .single()

  const humanResult = handleSingleResult(humanData, humanError, log, 'Human profile', { userId: authenticatedUser.id })
  if (humanResult.response) return humanResult.response
  const human = humanResult.data

  let action: StripeConnectAction = 'setup'
  try {
    const rawBody = await request.text()
    if (rawBody) {
      const parsedBody = stripeConnectActionSchema.safeParse(JSON.parse(rawBody))
      if (!parsedBody.success) {
        return NextResponse.json({
          success: false,
          error: parsedBody.error.flatten(),
        }, { status: 400 })
      }
      action = parsedBody.data.action
    }
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    )
  }

  try {
    let accountId = human.stripe_account_id
    let linkType: 'account_onboarding' | 'account_update' = human.stripe_onboarding_complete
      ? 'account_update'
      : 'account_onboarding'
    const fallbackEmail = `human-${human.id}@users.analoglabor.invalid`

    async function createAndPersistConnectAccount() {
      const connectAccount = await createConnectAccount(authenticatedUser.email || fallbackEmail, human.id)
      accountId = connectAccount.id
      linkType = 'account_onboarding'

      const { error: updateHumanError } = await serviceClient
        .from('humans')
        .update({
          stripe_account_id: accountId,
          stripe_onboarding_complete: false,
        })
        .eq('id', human.id)

      if (updateHumanError) {
        throw new Error(updateHumanError.message)
      }
    }

    if (!accountId) {
      await createAndPersistConnectAccount()
    }

    if (action === 'manage' && human.stripe_onboarding_complete) {
      try {
        const loginLink = await createConnectLoginLink(accountId)
        log.info('Generated Stripe Connect login link', {
          humanId: human.id,
          action,
          accountId,
        })
        return NextResponse.json({
          success: true,
          data: {
            account_id: accountId,
            redirect_url: loginLink.url,
            redirect_kind: 'express_dashboard',
            onboarding_url: loginLink.url,
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn('Failed to create Stripe Connect login link; falling back to account link', {
          humanId: human.id,
          action,
          accountId,
          message,
        })
      }
    }

    const appBaseUrl = resolveCanonicalAppOrigin(request.nextUrl.origin)
    const returnUrl = `${appBaseUrl}/dashboard/profile?stripe=connected`
    const refreshUrl = `${appBaseUrl}/dashboard/profile?stripe=refresh`
    let accountLink

    try {
      accountLink = await createConnectAccountLink(accountId, returnUrl, refreshUrl, linkType)
    } catch (error) {
      if (isMissingConnectedAccountError(error)) {
        // Recover from stale stripe_account_id values (e.g. account removed in Stripe).
        await createAndPersistConnectAccount()
        accountLink = await createConnectAccountLink(accountId, returnUrl, refreshUrl, 'account_onboarding')
      } else if (linkType === 'account_update' && isUnsupportedAccountUpdateLinkError(error)) {
        // Express/Standard accounts can reject account_update links. Fallback to onboarding.
        linkType = 'account_onboarding'
        accountLink = await createConnectAccountLink(accountId, returnUrl, refreshUrl, 'account_onboarding')
      } else {
        throw error
      }
    }

    log.info('Generated Stripe Connect account link', {
      humanId: human.id,
      action,
      accountId,
      linkType,
    })

    return NextResponse.json({
      success: true,
      data: {
        account_id: accountId,
        redirect_url: accountLink.url,
        redirect_kind: linkType,
        onboarding_url: accountLink.url,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''

    if (isStripeConnectNotEnabledError(error)) {
      return NextResponse.json(
        {
          success: false,
          code: 'STRIPE_CONNECT_NOT_ENABLED',
          error: 'Stripe Connect is not enabled for this platform Stripe account. Enable Stripe Connect in the Stripe Dashboard, then retry.',
        },
        { status: 503 }
      )
    }

    log.error(
      'Error creating Stripe onboarding link',
      { humanId: human.id, action },
      error instanceof Error ? error : { message: String(error) }
    )
    return NextResponse.json({
      success: false,
      error: message || 'Failed to create Stripe onboarding link',
    }, { status: 500 })
  }
}
