import { NextRequest, NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/admin/admin-auth'
import { deriveConnectSampleAccountStatus, getConnectSampleStripeClient } from '@/lib/stripe-connect-sample'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ accountId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
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
  let account
  try {
    account = await stripeClient.v2.core.accounts.retrieve(accountId, {
      include: ['configuration.recipient', 'requirements'],
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to retrieve Stripe account status' },
      { status: 502 }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      account,
      status: deriveConnectSampleAccountStatus(account),
    },
  })
}
