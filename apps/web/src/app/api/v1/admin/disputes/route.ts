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
  const status = searchParams.get('status') // 'open', 'under_review', 'resolved', 'dismissed', or null for all

  const supabase = await createServiceClient()

  let query = supabase
    .from('disputes')
    .select(`
      *,
      bookings (
        id,
        title,
        amount,
        currency,
        human_id,
        agent_id,
        humans (id, name),
        agents (id, name)
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
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
