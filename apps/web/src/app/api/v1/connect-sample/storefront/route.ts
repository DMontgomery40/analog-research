import { NextResponse } from 'next/server'
import Stripe from 'stripe'

import { createServiceClient } from '@/lib/supabase/server'
import {
  CONNECT_SAMPLE_PRODUCT_ACCOUNT_METADATA_KEY,
  deriveConnectSampleAccountStatus,
  getConnectSampleMissingTableErrorMessage,
  getConnectSampleStripeClient,
  isMissingConnectSampleTableError,
} from '@/lib/stripe-connect-sample'

export const runtime = 'nodejs'

function formatProduct(product: Stripe.Product) {
  const defaultPrice = typeof product.default_price === 'string'
    ? null
    : product.default_price

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    connectedAccountId: product.metadata?.[CONNECT_SAMPLE_PRODUCT_ACCOUNT_METADATA_KEY] || null,
    defaultPrice: defaultPrice
      ? {
        id: defaultPrice.id,
        unitAmount: defaultPrice.unit_amount,
        currency: defaultPrice.currency,
      }
      : null,
  }
}

export async function GET() {
  let stripeClient
  try {
    stripeClient = getConnectSampleStripeClient()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 }
    )
  }
  let products
  try {
    products = await stripeClient.products.list({
      active: true,
      limit: 100,
      expand: ['data.default_price'],
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list Stripe products' },
      { status: 502 }
    )
  }

  const formattedProducts = products.data
    .map(formatProduct)
    .filter((product) => Boolean(product.connectedAccountId))

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('stripe_connect_sample_accounts')
    .select('stripe_account_id, display_name')
    .order('created_at', { ascending: false })

  const warnings: string[] = []
  let accountRows: { stripe_account_id: string; display_name: string }[] = []

  if (error) {
    if (isMissingConnectSampleTableError(error)) {
      warnings.push(getConnectSampleMissingTableErrorMessage())
    } else {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
  } else {
    accountRows = Array.isArray(data)
      ? data
        .map((row) => ({
          stripe_account_id: row.stripe_account_id,
          display_name: row.display_name || row.stripe_account_id,
        }))
        .filter((row) => Boolean(row.stripe_account_id))
      : []
  }

  const displayNameByAccountId = new Map<string, string>(
    accountRows.map((row) => [row.stripe_account_id, row.display_name])
  )

  const connectedAccountIds = new Set<string>()
  for (const product of formattedProducts) {
    if (product.connectedAccountId) connectedAccountIds.add(product.connectedAccountId)
  }
  for (const row of accountRows) {
    connectedAccountIds.add(row.stripe_account_id)
  }

  const accounts = await Promise.all(Array.from(connectedAccountIds).map(async (accountId) => {
    try {
      const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
        include: ['configuration.recipient', 'requirements'],
      })

      return {
        accountId,
        displayName: displayNameByAccountId.get(accountId) || account.display_name || account.contact_email || accountId,
        status: deriveConnectSampleAccountStatus(account),
      }
    } catch (accountError) {
      return {
        accountId,
        displayName: displayNameByAccountId.get(accountId) || accountId,
        status: null,
        statusError: accountError instanceof Error ? accountError.message : String(accountError),
      }
    }
  }))

  return NextResponse.json({
    success: true,
    data: {
      accounts,
      products: formattedProducts,
      warnings,
    },
  })
}
