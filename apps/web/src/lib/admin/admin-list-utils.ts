import { NextResponse } from 'next/server'

export function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function sanitizeAdminSearch(
  value: string | null
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (!value) return { ok: true, value: null }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: null }
  if (trimmed.length > 200) return { ok: false, error: 'search must be 200 characters or fewer' }
  // Defensive: prevent PostgREST filter-string injection via .or(...) segments.
  if (/[(),]/.test(trimmed)) return { ok: false, error: 'search contains unsupported characters' }
  const normalized = trimmed
    .replace(/\s+/g, ' ')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .trim()

  return { ok: true, value: normalized || null }
}

export function adminListResponse<T>(
  data: T[] | null,
  error: { message: string } | null,
  pagination: { limit: number; offset: number; total: number | null }
): NextResponse {
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: data || [],
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      total: pagination.total || 0,
    },
  })
}
