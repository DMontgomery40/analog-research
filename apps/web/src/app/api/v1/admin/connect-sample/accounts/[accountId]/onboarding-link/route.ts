import { NextRequest, NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/admin/admin-auth'
import { getConnectSampleAppOrigin, getConnectSampleStripeClient } from '@/lib/stripe-connect-sample'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ accountId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const { accountId } = await context.params
  if (!accountId) {
    return NextResponse.json({ success: false, error: 'Missing accountId' }, { status: 400 })
  }

  let stripeClient
  try {
    stripeClient = getConnectSampleStripeClient()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 }
    )
  }

  const appOrigin = getConnectSampleAppOrigin(request.nextUrl.origin)

  const refreshUrl = `${appOrigin}/admin/connect-sample?refresh=1&accountId=${accountId}`
  const returnUrl = `${appOrigin}/admin/connect-sample?return=1&accountId=${accountId}`

  let accountLink
  try {
    accountLink = await stripeClient.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: refreshUrl,
          return_url: returnUrl,
        },
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create onboarding link' },
      { status: 502 }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      accountId,
      url: accountLink.url,
      expiresAt: accountLink.expires_at,
    },
  })
}
