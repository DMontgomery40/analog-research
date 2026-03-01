import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/admin-auth'
import { parsePositiveInt, sanitizeAdminSearch } from '@/lib/admin/admin-list-utils'

export async function requireAdminServiceClient(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createServiceClient>> }
  | { ok: false; response: NextResponse }
> {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: admin.error }, { status: admin.status }),
    }
  }

  const supabase = await createServiceClient()
  return { ok: true, supabase }
}

export async function initAdminListRequest(request: NextRequest): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createServiceClient>>; limit: number; offset: number; search: string | null }
  | { ok: false; response: NextResponse }
> {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: admin.error }, { status: admin.status }),
    }
  }

  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(Math.max(parsePositiveInt(searchParams.get('limit'), 50), 1), 200)
  const offset = Math.max(parsePositiveInt(searchParams.get('offset'), 0), 0)

  const searchResult = sanitizeAdminSearch(searchParams.get('search'))
  if (!searchResult.ok) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: searchResult.error }, { status: 400 }),
    }
  }

  const supabase = await createServiceClient()

  return {
    ok: true,
    supabase,
    limit,
    offset,
    search: searchResult.value,
  }
}
