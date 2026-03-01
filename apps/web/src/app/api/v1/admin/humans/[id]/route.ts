import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/admin-auth'
import { logAdminAction } from '@/lib/admin/audit'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'
import { parseZodJsonBody } from '@/lib/request-body'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  bio: z.string().trim().min(1).max(10000).nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  location: z.string().trim().min(1).max(200).nullable().optional(),
  drive_radius_miles: z.number().int().min(0).nullable().optional(),
  timezone: z.string().trim().min(1).max(100).nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  rate_min: z.number().int().min(0).max(1_000_000).optional(),
  rate_max: z.number().int().min(0).max(1_000_000).optional(),
  notes: z.string().trim().min(1).max(2000).optional(),
}).strict()

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/admin/humans/[id]/route.ts', 'GET')
  const admin = await requireAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const { id } = await params
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('humans')
    .select('*')
    .eq('id', id)
    .single()

  const humanResult = handleSingleResult(data, error, log, 'Human', { humanId: id })
  if (humanResult.response) return humanResult.response

  // Also fetch related stats
  const [bookingsResult, applicationsResult] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, title, status, amount, currency, created_at')
      .eq('human_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('applications')
      .select('id, status, proposed_rate, created_at, bounties(id, title)')
      .eq('human_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (bookingsResult.error) {
    return NextResponse.json({ success: false, error: bookingsResult.error.message }, { status: 500 })
  }

  if (applicationsResult.error) {
    return NextResponse.json({ success: false, error: applicationsResult.error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      human: humanResult.data,
      recentBookings: bookingsResult.data || [],
      recentApplications: applicationsResult.data || [],
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/admin/humans/[id]/route.ts', 'PATCH')
  const admin = await requireAdmin()
  if (!admin.ok || !admin.email || !admin.userId) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const parsed = await parseZodJsonBody(request, patchSchema)
  if (!parsed.ok) return parsed.response

  const { notes, ...payload } = parsed.data
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ success: false, error: 'No updates provided' }, { status: 400 })
  }

  const { id } = await params
  const supabase = await createServiceClient()

  const { data: beforeData, error: beforeError } = await supabase
    .from('humans')
    .select('id, name, bio, avatar_url, location, drive_radius_miles, timezone, skills, rate_min, rate_max')
    .eq('id', id)
    .single()

  const beforeResult = handleSingleResult(beforeData, beforeError, log, 'Human', { humanId: id })
  if (beforeResult.response) return beforeResult.response
  const before = beforeResult.data

  const effectiveRateMin = payload.rate_min ?? (before as any).rate_min
  const effectiveRateMax = payload.rate_max ?? (before as any).rate_max
  if (Number.isFinite(effectiveRateMin) && Number.isFinite(effectiveRateMax) && effectiveRateMin > effectiveRateMax) {
    return NextResponse.json({ success: false, error: 'rate_min must be less than or equal to rate_max' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.bio !== undefined) updates.bio = payload.bio
  if (payload.avatar_url !== undefined) updates.avatar_url = payload.avatar_url
  if (payload.location !== undefined) updates.location = payload.location
  if (payload.drive_radius_miles !== undefined) updates.drive_radius_miles = payload.drive_radius_miles
  if (payload.timezone !== undefined) updates.timezone = payload.timezone
  if (payload.skills !== undefined) updates.skills = payload.skills
  if (payload.rate_min !== undefined) updates.rate_min = payload.rate_min
  if (payload.rate_max !== undefined) updates.rate_max = payload.rate_max

  const { data: after, error: updateError } = await supabase
    .from('humans')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (updateError) {
    log.error('Failed to update human', { humanId: id }, { message: updateError.message, code: updateError.code })
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  try {
    await logAdminAction({
      action: 'human.update',
      adminEmail: admin.email,
      adminUserId: admin.userId,
      targetType: 'human',
      targetId: id,
      beforeState: {
        name: (before as any).name,
        bio: (before as any).bio,
        avatar_url: (before as any).avatar_url,
        location: (before as any).location,
        drive_radius_miles: (before as any).drive_radius_miles,
        timezone: (before as any).timezone,
        skills: (before as any).skills,
        rate_min: (before as any).rate_min,
        rate_max: (before as any).rate_max,
      },
      afterState: {
        name: (after as any).name,
        bio: (after as any).bio,
        avatar_url: (after as any).avatar_url,
        location: (after as any).location,
        drive_radius_miles: (after as any).drive_radius_miles,
        timezone: (after as any).timezone,
        skills: (after as any).skills,
        rate_min: (after as any).rate_min,
        rate_max: (after as any).rate_max,
      },
      notes: notes ?? undefined,
    })
  } catch (error) {
    log.error('Failed to log admin action (non-blocking)', { humanId: id }, error instanceof Error ? { message: error.message } : { message: String(error) })
  }

  return NextResponse.json({ success: true, data: after })
}
