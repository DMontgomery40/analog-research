import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { parseZodJsonBody } from '@/lib/request-body'
import {
  CONNECT_SAMPLE_PRODUCT_ACCOUNT_METADATA_KEY,
  getConnectSampleAppOrigin,
  getConnectSampleStripeClient,
} from '@/lib/stripe-connect-sample'

export const runtime = 'nodejs'

const createCheckoutSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().int().positive().max(50).optional().default(1),
})

export async function POST(request: NextRequest) {
  const parsed = await parseZodJsonBody(request, createCheckoutSchema)
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
  const appOrigin = getConnectSampleAppOrigin(request.nextUrl.origin)

  let product
  try {
    product = await stripeClient.products.retrieve(parsed.data.productId, {
      expand: ['default_price'],
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load Stripe product' },
      { status: 502 }
    )
  }

  const connectedAccountId = product.metadata?.[CONNECT_SAMPLE_PRODUCT_ACCOUNT_METADATA_KEY]
  if (!connectedAccountId) {
    return NextResponse.json({
      success: false,
      error: `Product ${product.id} is missing metadata.${CONNECT_SAMPLE_PRODUCT_ACCOUNT_METADATA_KEY}.`,
    }, { status: 400 })
  }

  if (!connectedAccountId.startsWith('acct_')) {
    return NextResponse.json({
      success: false,
      error: `metadata.${CONNECT_SAMPLE_PRODUCT_ACCOUNT_METADATA_KEY} must be a Stripe connected account id (acct_*).`,
    }, { status: 400 })
  }

  if (!product.default_price || typeof product.default_price === 'string') {
    return NextResponse.json({
      success: false,
      error: `Product ${product.id} is missing an expanded default price.`,
    }, { status: 400 })
  }

  const unitAmount = product.default_price.unit_amount
  if (!unitAmount || unitAmount <= 0) {
    return NextResponse.json({
      success: false,
      error: `Product ${product.id} has invalid default_price.unit_amount.`,
    }, { status: 400 })
  }

  const quantity = parsed.data.quantity
  const subtotal = unitAmount * quantity

  // 3% platform monetization fee.
  const applicationFeeAmount = Math.round(subtotal * 0.03)

  let checkoutSession
  try {
    checkoutSession = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: product.default_price.id,
          quantity,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: connectedAccountId,
        },
        metadata: {
          connect_sample_product_id: product.id,
          connect_sample_connected_account_id: connectedAccountId,
        },
      },
      success_url: `${appOrigin}/connect-sample/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/connect-sample?canceled=1`,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create Stripe Checkout session' },
      { status: 502 }
    )
  }

  if (!checkoutSession.url) {
    return NextResponse.json({ success: false, error: 'Stripe checkout session did not return a url.' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
      applicationFeeAmount,
    },
  })
}
