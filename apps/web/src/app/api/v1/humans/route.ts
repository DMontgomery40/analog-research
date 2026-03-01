import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  collectSocialLinksCandidate,
  coerceSocialLinksFromRow,
  socialLinksToDbColumns,
  validateAndNormalizeSocialLinks,
} from '@/lib/social-links'
import {
  parseBoundedIntegerParam,
  parseOptionalBoundedIntegerParam,
} from '@/lib/request-params'
import { logger } from '@/lib/logger'
import { isMissingColumnError } from '@/lib/supabase/errors'
import { z } from 'zod'

const createHumanSchema = z.object({
  name: z.string().min(1).max(200),
  bio: z.string().max(2000).nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  drive_radius_miles: z.number().int().min(0).nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
  skills: z.array(z.string().max(50)).max(20).optional().default([]),
  rate_min: z.number().int().min(0).max(1000000).optional().default(0),
  rate_max: z.number().int().min(0).max(1000000).optional().default(0),
  availability: z.record(z.any()).optional().default({}),
  wallet_address: z.string().max(200).nullable().optional(),
  social_links: z.record(z.string()).optional(),
  github_url: z.string().url().nullable().optional(),
  linkedin_url: z.string().url().nullable().optional(),
  instagram_url: z.string().url().nullable().optional(),
  youtube_url: z.string().url().nullable().optional(),
  website_url: z.string().url().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.rate_min > data.rate_max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rate_min'],
      message: 'rate_min must be less than or equal to rate_max',
    })
  }
})

interface TimeSlot {
  start: string
  end: string
}

interface AvailabilitySchedule {
  monday?: TimeSlot[]
  tuesday?: TimeSlot[]
  wednesday?: TimeSlot[]
  thursday?: TimeSlot[]
  friday?: TimeSlot[]
  saturday?: TimeSlot[]
  sunday?: TimeSlot[]
}

function normalizeSearchTerm(input: string | null): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // Supabase PostgREST `.or()` filters treat commas/parentheses as syntax.
  // Also escape SQL LIKE wildcards (% and _) to prevent data enumeration.
  const normalized = trimmed
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    // Escape SQL LIKE special characters
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .trim()

  return normalized || null
}

// Get current day name in a timezone
function getCurrentDayInTimezone(timezone: string): keyof AvailabilitySchedule {
  try {
    const now = new Date()
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone })
      .format(now)
      .toLowerCase()
      .slice(0, 3)

    const weekdayKeyMap: Record<string, keyof AvailabilitySchedule> = {
      sun: 'sunday',
      mon: 'monday',
      tue: 'tuesday',
      wed: 'wednesday',
      thu: 'thursday',
      fri: 'friday',
      sat: 'saturday',
    }

    return weekdayKeyMap[weekday] ?? (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()] as keyof AvailabilitySchedule)
  } catch {
    return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()] as keyof AvailabilitySchedule
  }
}

// Get current time in HH:MM format in a timezone
function getCurrentTimeInTimezone(timezone: string): string {
  try {
    const now = new Date()
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone
    }).format(now)
  } catch {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  }
}

// Check if a time falls within any availability slot
function isTimeWithinSlots(time: string, slots: TimeSlot[] | undefined): boolean {
  if (!slots || slots.length === 0) return false
  return slots.some(slot => time >= slot.start && time < slot.end)
}

// Check if a human is available right now based on their timezone and availability
function isHumanAvailableNow(human: { timezone: string | null; availability: unknown }): boolean {
  if (!human.timezone || !human.availability) return false
  const availability = human.availability as AvailabilitySchedule
  const currentDay = getCurrentDayInTimezone(human.timezone)
  const currentTime = getCurrentTimeInTimezone(human.timezone)
  return isTimeWithinSlots(currentTime, availability[currentDay])
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  // Parse filters
  const skill = searchParams.get('skill')
  const skills = skill ? [skill] : searchParams.get('skills')?.split(',').filter(Boolean)
  const search = normalizeSearchTerm(searchParams.get('search') || searchParams.get('q'))
  const rateMinRaw = searchParams.get('min_rate') || searchParams.get('rate_min')
  const rateMaxRaw = searchParams.get('max_rate') || searchParams.get('rate_max')
  const availableDay = searchParams.get('available_day')
  const city = searchParams.get('city')
  const state = searchParams.get('state')
  const country = searchParams.get('country')
  const location = searchParams.get('location')
  const isRemote = searchParams.get('is_remote')
  const availableNow = searchParams.get('available_now')
  const minRating = searchParams.get('min_rating')
  const minHlsRaw = searchParams.get('min_hls')
  const verified = searchParams.get('verified')
  const driveRadiusRaw = searchParams.get('drive_radius_miles')
  const limitResult = parseBoundedIntegerParam(searchParams.get('limit'), {
    paramName: 'limit',
    min: 1,
    max: 100,
    defaultValue: 20,
  })
  const offsetResult = parseBoundedIntegerParam(searchParams.get('offset'), {
    paramName: 'offset',
    min: 0,
    max: 10000,
    defaultValue: 0,
  })
  const rateMinResult = parseOptionalBoundedIntegerParam(rateMinRaw, {
    paramName: 'min_rate',
    min: 0,
    max: 1000000,
  })
  const rateMaxResult = parseOptionalBoundedIntegerParam(rateMaxRaw, {
    paramName: 'max_rate',
    min: 0,
    max: 1000000,
  })

  if (!limitResult.ok) {
    return NextResponse.json({ success: false, error: limitResult.error }, { status: 400 })
  }

  if (!offsetResult.ok) {
    return NextResponse.json({ success: false, error: offsetResult.error }, { status: 400 })
  }

  if (!rateMinResult.ok) {
    return NextResponse.json({ success: false, error: rateMinResult.error }, { status: 400 })
  }

  if (!rateMaxResult.ok) {
    return NextResponse.json({ success: false, error: rateMaxResult.error }, { status: 400 })
  }

  const limit = limitResult.value
  const offset = offsetResult.value
  const rateMin = rateMinResult.value
  const rateMax = rateMaxResult.value

  let driveRadius: number | null = null
  if (driveRadiusRaw !== null && driveRadiusRaw.trim() !== '') {
    const trimmed = driveRadiusRaw.trim()
    if (!/^\d+$/.test(trimmed)) {
      return NextResponse.json(
        { success: false, error: 'drive_radius_miles must be a non-negative integer' },
        { status: 400 }
      )
    }

    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isSafeInteger(parsed)) {
      return NextResponse.json(
        { success: false, error: 'drive_radius_miles must be a non-negative integer' },
        { status: 400 }
      )
    }

    driveRadius = parsed
  }

  if (search && search.length > 200) {
    return NextResponse.json(
      { success: false, error: 'search must be 200 characters or fewer' },
      { status: 400 }
    )
  }

  let minHls: number | null = null
  if (minHlsRaw !== null) {
    const parsedMinHls = Number.parseFloat(minHlsRaw)
    if (Number.isNaN(parsedMinHls) || parsedMinHls < 0 || parsedMinHls > 100) {
      return NextResponse.json(
        { success: false, error: 'min_hls must be a number between 0 and 100' },
        { status: 400 }
      )
    }
    minHls = parsedMinHls
  }

  let parsedMinRating: number | null = null
  if (minRating !== null) {
    const value = Number.parseFloat(minRating)
    if (!Number.isFinite(value) || value < 1 || value > 5) {
      return NextResponse.json(
        { success: false, error: 'min_rating must be a number between 1 and 5' },
        { status: 400 }
      )
    }
    parsedMinRating = value
  }

  const supabase = await createServiceClient()

  const hasPostFilters = Boolean(availableDay || availableNow === 'true' || isRemote === 'true')
  // Availability filters are applied in-process (timezone + JSON schedule), so we must paginate after filtering.
  const MAX_POST_FILTER_SCAN = 10_000
  const scanStart = hasPostFilters ? 0 : offset
  const scanEnd = hasPostFilters ? (MAX_POST_FILTER_SCAN - 1) : (offset + limit - 1)

  const preferredSelect = 'id, name, bio, avatar_url, location, drive_radius_miles, timezone, skills, rate_min, rate_max, availability, rating_average, rating_count, is_verified, completed_bookings, human_legitimacy_score, human_legitimacy_confidence, human_legitimacy_version, social_links, github_url, linkedin_url, instagram_url, youtube_url, website_url'
  const fallbackSelect = 'id, name, bio, avatar_url, location, timezone, skills, rate_min, rate_max, availability, rating_average, rating_count, is_verified, completed_bookings, human_legitimacy_score, human_legitimacy_confidence, human_legitimacy_version, social_links, github_url, linkedin_url, instagram_url, youtube_url, website_url'

  const buildQuery = (select: string, options: { supportsDriveRadius: boolean }) => {
    let query = supabase
      .from('humans')
      .select(select, { count: 'exact' })
      .order('human_legitimacy_score', { ascending: false })
      .order('rating_average', { ascending: false })
      .range(scanStart, scanEnd)

    // Apply filters
    if (skills?.length) {
      query = query.overlaps('skills', skills)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,bio.ilike.%${search}%`)
    }

    if (rateMin !== null) {
      query = query.gte('rate_max', rateMin)
    }

    if (rateMax !== null) {
      query = query.lte('rate_min', rateMax)
    }

    // Location filters: city, state, country are stored in the location field
    // Format is typically "City, State, Country" or similar
    if (city) {
      query = query.ilike('location', `${city}%`)
    }

    if (state) {
      query = query.ilike('location', `%${state}%`)
    }

    if (country) {
      query = query.ilike('location', `%${country}`)
    }

    if (location) {
      query = query.ilike('location', `%${location}%`)
    }

    if (parsedMinRating !== null) {
      query = query.gte('rating_average', parsedMinRating)
    }

    if (minHls !== null) {
      query = query.gte('human_legitimacy_score', minHls)
    }

    if (verified === 'true') {
      query = query.eq('is_verified', true)
    }

    if (driveRadius !== null && driveRadius > 0 && options.supportsDriveRadius) {
      query = query.gte('drive_radius_miles', driveRadius)
    }

    return query
  }

  const preferredResult = await buildQuery(preferredSelect, { supportsDriveRadius: true })
  let data = preferredResult.data as unknown[] | null
  let error = preferredResult.error
  let count = preferredResult.count

  // Stay compatible with environments that haven't migrated drive_radius_miles yet.
  if (isMissingColumnError(error, { column: 'drive_radius_miles', table: 'humans' })) {
    const fallbackResult = await buildQuery(fallbackSelect, { supportsDriveRadius: false })
    data = fallbackResult.data as unknown[] | null
    error = fallbackResult.error
    count = fallbackResult.count
  }

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Post-query filters (for availability)
  let filteredData = (data || []) as Array<{
    timezone: string | null
    availability: unknown
    location: string | null
  } & Record<string, unknown>>

  // Filter by availability day if specified
  if (availableDay) {
    filteredData = filteredData.filter((human) => {
      const availability = human.availability as AvailabilitySchedule
      const dayKey = availableDay.toLowerCase() as keyof AvailabilitySchedule
      return availability?.[dayKey]?.length ? availability[dayKey]!.length > 0 : false
    })
  }

  // Filter by available_now (checks current time vs human's timezone + availability)
  if (availableNow === 'true') {
    filteredData = filteredData.filter(isHumanAvailableNow)
  }

  // Note: is_remote would need a dedicated field in the schema
  // For now we can filter by checking if location indicates remote
  if (isRemote === 'true') {
    filteredData = filteredData.filter((human) => {
      const loc = (human.location || '').toLowerCase()
      return loc.includes('remote') || loc.includes('anywhere') || loc === ''
    })
  }

  const hydratedData = filteredData.map((human) => ({
    ...human,
    social_links: coerceSocialLinksFromRow(human as any),
  }))

  const totalIsEstimated = hasPostFilters && (data || []).length >= MAX_POST_FILTER_SCAN
  const pageData = hasPostFilters
    ? hydratedData.slice(offset, offset + limit)
    : hydratedData

  return NextResponse.json({
    success: true,
    data: pageData,
    pagination: {
      offset,
      limit,
      total: hasPostFilters ? hydratedData.length : (count ?? hydratedData.length),
      ...(hasPostFilters ? { total_is_estimated: totalIsEstimated } : null),
    },
  })
}

export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/humans/route.ts', 'POST')
  const supabase = await createClient()

  // Check if user is authenticated via Supabase session
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Check if profile already exists (use limit(1) instead of single() to avoid error on duplicates)
  const { data: existingProfiles, error: existingError } = await supabase
    .from('humans')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  if (existingError) {
    log.error('Failed to check existing profiles', { userId: user.id }, { message: existingError.message, code: existingError.code })
    return NextResponse.json({ success: false, error: existingError.message }, { status: 500 })
  }

  if (existingProfiles && existingProfiles.length > 0) {
    return NextResponse.json({ success: false, error: 'Profile already exists' }, { status: 409 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createHumanSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  const socialCandidate = collectSocialLinksCandidate(body)
  const socialValidation = validateAndNormalizeSocialLinks(socialCandidate.candidate)
  if (!socialValidation.ok) {
    return NextResponse.json(
      { success: false, error: 'Invalid social links', details: socialValidation.errors },
      { status: 400 }
    )
  }

  const socialLinks = socialValidation.data
  const socialColumns = socialLinksToDbColumns(socialLinks)

  // Create the profile
  const profileData: Record<string, unknown> = {
    user_id: user.id,
    name: parsed.data.name.trim(),
    bio: parsed.data.bio ?? null,
    avatar_url: parsed.data.avatar_url ?? null,
    location: parsed.data.location ?? null,
    timezone: parsed.data.timezone ?? null,
    skills: parsed.data.skills,
    rate_min: parsed.data.rate_min,
    rate_max: parsed.data.rate_max,
    availability: parsed.data.availability,
    wallet_address: parsed.data.wallet_address ?? null,
    social_links: socialLinks,
    ...socialColumns,
  }

  if (typeof parsed.data.drive_radius_miles === 'number') {
    profileData.drive_radius_miles = parsed.data.drive_radius_miles
  }

  const preferredInsert = await supabase
    .from('humans')
    .insert(profileData)
    .select()
    .single()

  let data = preferredInsert.data
  let error = preferredInsert.error

  if (
    isMissingColumnError(error, { column: 'drive_radius_miles', table: 'humans' })
    && Object.prototype.hasOwnProperty.call(profileData, 'drive_radius_miles')
  ) {
    const { drive_radius_miles: _ignored, ...fallbackProfileData } = profileData

    const fallbackInsert = await supabase
      .from('humans')
      .insert(fallbackProfileData)
      .select()
      .single()

    data = fallbackInsert.data
    error = fallbackInsert.error
  }

  if (error) {
    log.error('Failed to create profile', { userId: user.id }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data }, { status: 201 })
}
