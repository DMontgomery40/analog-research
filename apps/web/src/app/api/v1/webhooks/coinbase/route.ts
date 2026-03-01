import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { calculatePlatformFeeCents } from '@/lib/payments/pricing'
import {
  getCryptoPayment,
  getCoinbaseTransactionHash,
  verifyCoinbaseWebhookSignature,
} from '@/lib/coinbase'
import { acquireWebhookLock } from '@/lib/webhook-idempotency'
import { logger } from '@/lib/logger'
import { ensureBookingSettlementRecords } from '@/lib/booking-settlement'

export const runtime = 'nodejs'

type CoinbaseWebhookPayload = {
  id?: string
  eventType?: string
  type?: string
  metadata?: Record<string, string>
  paymentOperation?: {
    id?: string
    paymentId?: string
    txHash?: string
    transactionHash?: string
    metadata?: Record<string, string>
    params?: Record<string, unknown>
  }
  payment?: {
    id?: string
    paymentId?: string
    paymentLinkId?: string
    metadata?: Record<string, string>
  }
}

interface BookingRow {
  id: string
  bounty_id: string | null
  agent_id: string
  human_id: string
  title: string
  amount: number
  currency: string
  platform_fee: number
  payer_amount: number
  processor_fee: number
  status: string
  escrow_status: string
  payment_method: 'stripe' | 'crypto' | null
  coinbase_payment_id: string | null
}

function normalizeCoinbaseWebhookEvent(payload: unknown): CoinbaseWebhookPayload {
  if (!payload || typeof payload !== 'object') {
    return {}
  }

  const parsed = payload as Record<string, unknown>

  if (parsed.webhookEvent && typeof parsed.webhookEvent === 'object') {
    return parsed.webhookEvent as CoinbaseWebhookPayload
  }

  if (parsed.event && typeof parsed.event === 'object') {
    return parsed.event as CoinbaseWebhookPayload
  }

  if (parsed.data && typeof parsed.data === 'object') {
    const data = parsed.data as Record<string, unknown>
    if (data.webhookEvent && typeof data.webhookEvent === 'object') {
      return data.webhookEvent as CoinbaseWebhookPayload
    }
  }

  return parsed as CoinbaseWebhookPayload
}

function uppercase(value: string | undefined): string {
  return (value || '').toUpperCase()
}

function ensureMutationOk(result: { error: { message: string } | null }, context: string) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`)
  }
}

export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/webhooks/coinbase/route.ts', 'POST')
  const body = await request.text()
  const sharedSecret = process.env.COINBASE_COMMERCE_WEBHOOK_SHARED_SECRET

  if (!sharedSecret) {
    return NextResponse.json({ error: 'Missing webhook secret configuration' }, { status: 503 })
  }

  const hookId = request.headers.get('x-hook0-id')
  const timestamp = request.headers.get('x-hook0-timestamp')
  const signature = request.headers.get('x-hook0-signature')

  if (!hookId || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required Coinbase headers' }, { status: 400 })
  }

  if (!verifyCoinbaseWebhookSignature(body, request.headers, sharedSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const event = normalizeCoinbaseWebhookEvent(parsedBody)
  const eventId = event.id || request.headers.get('x-hook0-id')

  if (!eventId) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 })
  }

  const lockResult = await acquireWebhookLock(supabase, 'coinbase', eventId)
  if (lockResult.action === 'skip_duplicate') {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (lockResult.action === 'error') {
    return NextResponse.json({ error: lockResult.message }, { status: lockResult.status })
  }
  // action === 'process' or 'retry' — continue processing

  try {
    const eventType = uppercase(event.eventType || event.type)
    const paymentOperationParams = event.paymentOperation?.params && typeof event.paymentOperation.params === 'object'
      ? (event.paymentOperation.params as Record<string, unknown>)
      : undefined

    const paymentIdFromParams = (() => {
      const candidate = paymentOperationParams?.paymentId
      return typeof candidate === 'string' ? candidate : undefined
    })()

    const payloadPaymentId =
      event.paymentOperation?.paymentId ||
      paymentIdFromParams ||
      event.payment?.id ||
      event.payment?.paymentId

    const bookingIdFromParams = (() => {
      const candidate = paymentOperationParams?.booking_id
      if (typeof candidate === 'string') return candidate

      const metadata = paymentOperationParams?.metadata
      if (metadata && typeof metadata === 'object') {
        const bookingId = (metadata as Record<string, unknown>).booking_id
        if (typeof bookingId === 'string') return bookingId
      }

      return undefined
    })()

    const payloadBookingId =
      event.payment?.metadata?.booking_id ||
      event.paymentOperation?.metadata?.booking_id ||
      bookingIdFromParams ||
      event.metadata?.booking_id

    const paymentId = payloadPaymentId || null
    let paymentStatus = ''
    let bookingId = payloadBookingId || null
    let txHash = event.paymentOperation?.txHash || event.paymentOperation?.transactionHash || null
    let paymentLinkId: string | null = event.payment?.paymentLinkId || null

    if (paymentId) {
      try {
        const payment = await getCryptoPayment(paymentId)
        paymentStatus = uppercase(payment.status)
        paymentLinkId = payment.paymentLinkId || payment.paymentLink?.id || paymentLinkId
        bookingId = payment.metadata?.booking_id || bookingId
        txHash = getCoinbaseTransactionHash(payment) || txHash
      } catch (error) {
        log.error('Failed to hydrate Coinbase payment details', {}, error instanceof Error ? { message: error.message } : { message: String(error) })
      }
    }

    if (!bookingId && paymentLinkId) {
      const { data: bookingByPaymentLink, error: bookingByPaymentLinkError } = await supabase
        .from('bookings')
        .select('id')
        .eq('coinbase_payment_link_id', paymentLinkId)
        .maybeSingle()

      if (bookingByPaymentLinkError) {
        throw new Error(bookingByPaymentLinkError.message)
      }

      bookingId = bookingByPaymentLink?.id || null
    }

    if (!bookingId && paymentId) {
      const { data: bookingByPayment, error: bookingByPaymentError } = await supabase
        .from('bookings')
        .select('id')
        .eq('coinbase_payment_id', paymentId)
        .maybeSingle()

      if (bookingByPaymentError) {
        throw new Error(bookingByPaymentError.message)
      }

      bookingId = bookingByPayment?.id || null
    }

    if (!bookingId) {
      await supabase
        .from('webhook_events')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
        })
        .eq('provider', 'coinbase')
        .eq('event_id', eventId)

      return NextResponse.json({ received: true, ignored: true })
    }

    const { data: bookingData, error: bookingFetchError } = await supabase
      .from('bookings')
      .select('id, bounty_id, agent_id, human_id, title, amount, currency, platform_fee, payer_amount, processor_fee, status, escrow_status, payment_method, coinbase_payment_id')
      .eq('id', bookingId)
      .maybeSingle()

    if (bookingFetchError) {
      throw new Error(bookingFetchError.message)
    }

    const booking = bookingData as BookingRow | null
    if (!booking) {
      throw new Error('Booking not found for webhook event')
    }

    const platformFee = calculatePlatformFeeCents(booking.amount)

    if (paymentId) {
      const bookingPaymentUpdate = await supabase
        .from('bookings')
        .update({
          payment_method: 'crypto',
          coinbase_payment_id: paymentId,
          platform_fee: platformFee,
          processor_fee: 0,
          payer_amount: booking.amount,
        })
        .eq('id', booking.id)

      ensureMutationOk(bookingPaymentUpdate, 'Failed to update booking payment id')
    }

    const isAuthorized =
      eventType.includes('AUTHORIZED') ||
      paymentStatus === 'AUTHORIZED'
    const isCaptured =
      eventType.includes('CAPTURED') ||
      paymentStatus === 'CAPTURED'
    const isVoided =
      eventType.includes('VOIDED') ||
      paymentStatus === 'VOIDED'

    const shouldMarkAuthorized =
      isAuthorized || paymentStatus === 'AUTHORIZED'

    if (shouldMarkAuthorized && booking.escrow_status === 'pending') {
      const { error: rpcError } = await supabase.rpc('mark_escrow_funded_atomic', {
        p_booking_id: booking.id,
        p_payment_method: 'crypto',
        p_coinbase_payment_id: paymentId || booking.coinbase_payment_id,
        p_platform_fee: platformFee,
        p_processor_fee: 0,
        p_payer_amount: booking.amount,
        p_escrow_amount: booking.amount,
        p_currency: booking.currency,
        p_agent_id: booking.agent_id,
        p_human_id: booking.human_id,
        p_booking_title: booking.title,
        p_crypto_tx_hash: txHash,
      })

      ensureMutationOk({ error: rpcError }, 'Failed to mark booking escrow funded')
    }

    if (isCaptured) {
      const captureUpdatePayload: Record<string, unknown> = {
        escrow_status: 'released',
        status: booking.status === 'completed' ? booking.status : 'completed',
        payment_method: 'crypto',
        coinbase_payment_id: paymentId || booking.coinbase_payment_id,
      }

      if (booking.status !== 'completed') {
        captureUpdatePayload.completed_at = new Date().toISOString()
      }

      const { data: capturedBooking, error: bookingCapturedError } = await supabase
        .from('bookings')
        .update(captureUpdatePayload)
        .eq('id', booking.id)
        .eq('escrow_status', 'funded')
        .select('id, status, escrow_status')
        .maybeSingle()

      if (bookingCapturedError) {
        throw new Error(`Failed to mark booking escrow released: ${bookingCapturedError.message}`)
      }

      if (!capturedBooking) {
        const { data: latestState, error: latestStateError } = await supabase
          .from('bookings')
          .select('status, escrow_status')
          .eq('id', booking.id)
          .maybeSingle()

        if (latestStateError) {
          throw new Error(`Failed to read latest booking state: ${latestStateError.message}`)
        }

        if (latestState?.escrow_status !== 'released') {
          throw new Error('Failed to transition booking escrow to released')
        }
      }

      const payerAmount = booking.payer_amount > 0
        ? booking.payer_amount
        : booking.amount + (booking.processor_fee || 0)

      await ensureBookingSettlementRecords(supabase, {
        bookingId: booking.id,
        agentId: booking.agent_id,
        humanId: booking.human_id,
        amount: booking.amount,
        platformFee,
        payerAmount,
        currency: booking.currency,
        paymentMethod: 'crypto',
        cryptoTxHash: txHash,
        escrowReleaseDescription: 'Escrow released for completed work',
        platformFeeDescription: 'Platform fee (3%)',
      })

      if (txHash) {
        const txHashUpdate = await supabase
          .from('transactions')
          .update({ crypto_tx_hash: txHash })
          .eq('booking_id', booking.id)
          .eq('type', 'escrow_release')
          .is('crypto_tx_hash', null)

        ensureMutationOk(txHashUpdate, 'Failed to update escrow_release crypto tx hash')
      }
    }

    if (isVoided) {
      const bookingVoidedUpdate = await supabase
        .from('bookings')
        .update({
          escrow_status: 'refunded',
          status: booking.status === 'completed' ? booking.status : 'cancelled',
          payment_method: 'crypto',
        })
        .eq('id', booking.id)

      ensureMutationOk(bookingVoidedUpdate, 'Failed to mark booking escrow refunded')
    }

    await supabase
      .from('webhook_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('provider', 'coinbase')
      .eq('event_id', eventId)

    return NextResponse.json({ received: true })
  } catch (error) {
    await supabase
      .from('webhook_events')
      .update({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown processing error',
      })
      .eq('provider', 'coinbase')
      .eq('event_id', eventId)

    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
