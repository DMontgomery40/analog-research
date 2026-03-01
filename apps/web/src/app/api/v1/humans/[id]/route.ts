import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authenticateAgent } from '@/lib/api-auth'
import {
  collectSocialLinksCandidate,
  coerceSocialLinksFromRow,
  socialLinksToDbColumns,
  validateAndNormalizeSocialLinks,
} from '@/lib/social-links'
import { logger } from '@/lib/logger'
import { handleSingleResult, isMissingColumnError } from '@/lib/supabase/errors'
import { z } from 'zod'

export const runtime = 'nodejs'

const updateHumanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  bio: z.string().max(2000).nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  drive_radius_miles: z.number().int().min(0).nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
  skills: z.array(z.string().max(50)).max(20).optional(),
  rate_min: z.number().int().min(0).max(1000000).optional(),
  rate_max: z.number().int().min(0).max(1000000).optional(),
  availability: z.record(z.any()).optional(),
  wallet_address: z.string().max(200).nullable().optional(),
  social_links: z.record(z.string()).optional(),
  github_url: z.string().url().nullable().optional(),
  linkedin_url: z.string().url().nullable().optional(),
  instagram_url: z.string().url().nullable().optional(),
  youtube_url: z.string().url().nullable().optional(),
  website_url: z.string().url().nullable().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/humans/[id]/route.ts', 'GET')
  const { id } = await params
  const supabase = await createServiceClient()

  const preferredSelect = `
    id, name, bio, avatar_url, location, drive_radius_miles, timezone, skills,
    rate_min, rate_max, availability, rating_average, rating_count,
    is_verified, completed_bookings, created_at,
    human_legitimacy_score, human_legitimacy_confidence, human_legitimacy_version,
    social_links, github_url, linkedin_url, instagram_url, youtube_url, website_url
  `
  const fallbackSelect = `
    id, name, bio, avatar_url, location, timezone, skills,
    rate_min, rate_max, availability, rating_average, rating_count,
    is_verified, completed_bookings, created_at,
    human_legitimacy_score, human_legitimacy_confidence, human_legitimacy_version,
    social_links, github_url, linkedin_url, instagram_url, youtube_url, website_url
  `

  const preferredResult = await supabase
    .from('humans')
    .select(preferredSelect)
    .eq('id', id)
    .single()

  let data = preferredResult.data as Record<string, unknown> | null
  let error = preferredResult.error

  // Stay compatible with environments that haven't migrated drive_radius_miles yet.
  if (isMissingColumnError(error, { column: 'drive_radius_miles', table: 'humans' })) {
    const fallbackResult = await supabase
      .from('humans')
      .select(fallbackSelect)
      .eq('id', id)
      .single()

    data = fallbackResult.data as Record<string, unknown> | null
    error = fallbackResult.error
  }

  const humanResult = handleSingleResult(data, error, log, 'Human', { humanId: id })
  if (humanResult.response) return humanResult.response

  // Get recent reviews
  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at')
    .eq('reviewee_id', id)
    .eq('reviewee_type', 'human')
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json({
    success: true,
    data: {
      ...humanResult.data,
      social_links: coerceSocialLinksFromRow(humanResult.data),
      recent_reviews: reviews || [],
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const patchLog = logger.withContext('api/v1/humans/[id]/route.ts', 'PATCH')
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const agent = await authenticateAgent(request)

  // Humans can update their own profile. If a session exists, ignore any agent API key header.
  if (!user) {
    if (agent) {
      return NextResponse.json({ success: false, error: 'Agents cannot update human profiles' }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { data: humanData, error: humanError } = await supabase
    .from('humans')
    .select('user_id, rate_min, rate_max')
    .eq('id', id)
    .single()

  const humanResult = handleSingleResult(humanData, humanError, patchLog, 'Human', { humanId: id })
  if (humanResult.response) return humanResult.response
  const human = humanResult.data

  if (human.user_id !== user.id) {
    patchLog.warn('Forbidden: user does not own human profile', { userId: user.id, humanId: id })
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = updateHumanSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  const socialCandidate = collectSocialLinksCandidate(body)
  const socialValidation = socialCandidate.provided
    ? validateAndNormalizeSocialLinks(socialCandidate.candidate)
    : { ok: true as const, data: undefined }

  if (!socialValidation.ok) {
    return NextResponse.json(
      { success: false, error: 'Invalid social links', details: socialValidation.errors },
      { status: 400 }
    )
  }

  // Build updates from validated data
  const updates: Record<string, unknown> = {}
  const {
    name,
    bio,
    avatar_url,
    location,
    drive_radius_miles,
    timezone,
    skills,
    rate_min,
    rate_max,
    availability,
    wallet_address
  } = parsed.data

  if (name !== undefined) updates.name = name
  if (bio !== undefined) updates.bio = bio
  if (avatar_url !== undefined) updates.avatar_url = avatar_url
  if (location !== undefined) updates.location = location
  if (drive_radius_miles !== undefined) updates.drive_radius_miles = drive_radius_miles
  if (timezone !== undefined) updates.timezone = timezone
  if (skills !== undefined) updates.skills = skills
  if (rate_min !== undefined) updates.rate_min = rate_min
  if (rate_max !== undefined) updates.rate_max = rate_max
  if (availability !== undefined) updates.availability = availability
  if (wallet_address !== undefined) updates.wallet_address = wallet_address

  const effectiveRateMin = rate_min ?? (human as any).rate_min
  const effectiveRateMax = rate_max ?? (human as any).rate_max
  if (Number.isFinite(effectiveRateMin) && Number.isFinite(effectiveRateMax) && effectiveRateMin > effectiveRateMax) {
    return NextResponse.json({ success: false, error: 'rate_min must be less than or equal to rate_max' }, { status: 400 })
  }

  if (socialCandidate.provided && socialValidation.data) {
    updates.social_links = socialValidation.data
    Object.assign(updates, socialLinksToDbColumns(socialValidation.data))
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 })
  }

  const preferredUpdate = await supabase
    .from('humans')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  let updatedData = preferredUpdate.data
  let updateError = preferredUpdate.error

  // Stay compatible with environments that haven't migrated drive_radius_miles yet.
  if (
    isMissingColumnError(updateError, { column: 'drive_radius_miles', table: 'humans' })
    && Object.prototype.hasOwnProperty.call(updates, 'drive_radius_miles')
  ) {
    const { drive_radius_miles: _ignored, ...fallbackUpdates } = updates

    if (Object.keys(fallbackUpdates).length > 0) {
      const fallbackUpdate = await supabase
        .from('humans')
        .update(fallbackUpdates)
        .eq('id', id)
        .select()
        .single()

      updatedData = fallbackUpdate.data
      updateError = fallbackUpdate.error
    }
  }

  if (updateError) {
    patchLog.error('Failed to update human profile', { humanId: id }, { message: updateError.message, code: updateError.code })
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      ...updatedData,
      social_links: coerceSocialLinksFromRow(updatedData, { includePrivate: true }),
    },
  })
}
