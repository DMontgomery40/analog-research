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
  const status = searchParams.get('status') // 'pending', 'funded', 'in_progress', 'submitted', 'completed', 'disputed', 'cancelled'
  const escrowStatus = searchParams.get('escrow_status') // 'pending', 'funded', 'released', 'refunded', 'disputed'
  const paymentMethod = searchParams.get('payment_method') // 'stripe', 'crypto'

  const supabase = await createServiceClient()

  let query = supabase
    .from('bookings')
    .select(`
      *,
      humans (id, name, avatar_url, is_verified),
      agents (id, name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  if (escrowStatus) {
    query = query.eq('escrow_status', escrowStatus)
  }

  if (paymentMethod) {
    query = query.eq('payment_method', paymentMethod)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: data || [],
    pagination: {
      limit,
      offset,
      total: count || 0,
    },
  })
}
