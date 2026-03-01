import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/admin-auth'

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(Math.max(parsePositiveInt(searchParams.get('limit'), 50), 1), 200)
  const offset = Math.max(parsePositiveInt(searchParams.get('offset'), 0), 0)
  const currency = searchParams.get('currency') // 'USD', 'USDC', etc.
  const paymentMethod = searchParams.get('payment_method') // 'stripe', 'crypto'
  const from = searchParams.get('from') // ISO date string
  const to = searchParams.get('to') // ISO date string

  const supabase = await createServiceClient()

  // Transaction ledger is derived from bookings with completed escrow status
  let query = supabase
    .from('bookings')
    .select(`
      id,
      title,
      amount,
      currency,
      platform_fee,
      payment_method,
      escrow_status,
      stripe_payment_intent_id,
      coinbase_payment_id,
      crypto_tx_hash,
      completed_at,
      created_at,
      humans (id, name),
      agents (id, name)
    `, { count: 'exact' })
    .in('escrow_status', ['funded', 'released', 'refunded'])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (currency) {
    query = query.eq('currency', currency)
  }

  if (paymentMethod) {
    query = query.eq('payment_method', paymentMethod)
  }

  if (from) {
    query = query.gte('created_at', from)
  }

  if (to) {
    query = query.lte('created_at', to)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Calculate summary stats
  interface Transaction {
    amount: number
    currency: string
    platform_fee: number
    escrow_status: string
  }

  const transactions = (data || []) as Transaction[]
  const summary = {
    totalVolume: 0,
    totalFees: 0,
    volumeByCurrency: {} as Record<string, number>,
    feesByCurrency: {} as Record<string, number>,
  }

  for (const tx of transactions) {
    const curr = tx.currency || 'USD'
    summary.totalVolume += tx.amount
    summary.totalFees += tx.platform_fee
    summary.volumeByCurrency[curr] = (summary.volumeByCurrency[curr] || 0) + tx.amount
    summary.feesByCurrency[curr] = (summary.feesByCurrency[curr] || 0) + tx.platform_fee
  }

  return NextResponse.json({
    success: true,
    data: data || [],
    summary,
    pagination: {
      limit,
      offset,
      total: count || 0,
    },
  })
}
