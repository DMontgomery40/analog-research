import { NextRequest } from 'next/server'
import { initAdminListRequest } from '@/lib/admin/admin-api'
import { adminListResponse } from '@/lib/admin/admin-list-utils'

export async function GET(request: NextRequest) {
  const initResult = await initAdminListRequest(request)
  if (!initResult.ok) return initResult.response

  const { supabase, limit, offset, search } = initResult

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const moderation = searchParams.get('moderation')

  let query = supabase
    .from('bounties')
    .select(`
      *,
      agents (id, name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  if (moderation) {
    query = query.eq('moderation_decision', moderation)
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
  }

  const { data, error, count } = await query

  return adminListResponse(data, error, { limit, offset, total: count })
}
