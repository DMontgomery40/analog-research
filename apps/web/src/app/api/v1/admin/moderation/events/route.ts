import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireModerationAdmin } from '@/lib/moderation/admin-auth'

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: NextRequest) {
  const admin = await requireModerationAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(Math.max(parsePositiveInt(searchParams.get('limit'), 50), 1), 200)
  const offset = Math.max(parsePositiveInt(searchParams.get('offset'), 0), 0)
  const decision = searchParams.get('decision')
  const surface = searchParams.get('surface')
  const actorId = searchParams.get('actor_id')
  const contentType = searchParams.get('content_type')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const supabase = await createServiceClient()

  let query = supabase
    .from('moderation_events')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (decision) {
    query = query.eq('decision', decision)
  }

  if (surface) {
    query = query.eq('surface', surface)
  }

  if (actorId) {
    query = query.eq('actor_id', actorId)
  }

  if (contentType) {
    query = query.eq('content_type', contentType)
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
