import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'

import { requireAdmin } from '@/lib/admin/admin-auth'
import { parseZodJsonBody } from '@/lib/request-body'
import {
  CONNECT_SAMPLE_PRODUCT_ACCOUNT_METADATA_KEY,
  getConnectSampleStripeClient,
} from '@/lib/stripe-connect-sample'

export const runtime = 'nodejs'

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  connectedAccountId: z.string().trim().startsWith('acct_'),
  priceInCents: z.number().int().positive(),
  currency: z.string().trim().length(3).transform((value) => value.toLowerCase()),
})

function formatProduct(product: Stripe.Product) {
  const defaultPrice = typeof product.default_price === 'string'
    ? null
    : product.default_price

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    active: product.active,
    connectedAccountId: product.metadata?.[CONNECT_SAMPLE_PRODUCT_ACCOUNT_METADATA_KEY] || null,
    defaultPrice: defaultPrice
      ? {
        id: defaultPrice.id,
        unitAmount: defaultPrice.unit_amount,
        currency: defaultPrice.currency,
      }
      : null,
    created: product.created,
  }
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
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

  return NextResponse.json({
    success: true,
    data: {
      products: products.data.map(formatProduct),
    },
  })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const parsed = await parseZodJsonBody(request, createProductSchema)
  if (!parsed.ok) return parsed.response

  let stripeClient
  try {
    stripeClient = getConnectSampleStripeClient()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 }
    )
  }

  // Create products on the platform account.
  // Mapping from product -> connected account is stored in metadata.
  let productWithPrice
  try {
    const product = await stripeClient.products.create({
      name: parsed.data.name,
      description: parsed.data.description,
      metadata: {
        [CONNECT_SAMPLE_PRODUCT_ACCOUNT_METADATA_KEY]: parsed.data.connectedAccountId,
      },
      default_price_data: {
        unit_amount: parsed.data.priceInCents,
        currency: parsed.data.currency,
      },
    })

    productWithPrice = await stripeClient.products.retrieve(product.id, {
      expand: ['default_price'],
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create Stripe product' },
      { status: 502 }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      product: formatProduct(productWithPrice),
    },
  })
}
