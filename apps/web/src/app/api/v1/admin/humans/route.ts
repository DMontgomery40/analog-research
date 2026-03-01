import { NextRequest } from 'next/server'
import { initAdminListRequest } from '@/lib/admin/admin-api'
import { adminListResponse } from '@/lib/admin/admin-list-utils'

export async function GET(request: NextRequest) {
  const initResult = await initAdminListRequest(request)
  if (!initResult.ok) return initResult.response

  const { supabase, limit, offset, search } = initResult

  const searchParams = request.nextUrl.searchParams
  const verified = searchParams.get('verified')

  let query = supabase
    .from('humans')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (verified === 'true') {
    query = query.eq('is_verified', true)
  } else if (verified === 'false') {
    query = query.eq('is_verified', false)
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,bio.ilike.%${search}%`)
  }

  const { data, error, count } = await query

  return adminListResponse(data, error, { limit, offset, total: count })
}
