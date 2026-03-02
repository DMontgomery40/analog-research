import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import { parseBoundedIntegerParam } from '@/lib/request-params'
import {
  getPublicShowcaseConfig,
  isPublicShowcaseCuratedMode,
  shouldFailClosedPublicHumans,
} from '@/lib/public-showcase'
import BrowseHumansPage from './browse-humans-client'

const BROWSE_DESCRIPTION =
  'Browse available humans for hire on Analog Research. Filter by skills, rate, and location to hire for real-world tasks through our escrow-backed marketplace.'

const DEFAULT_LIMIT = 20

function getFirstSearchParam(value: string | string[] | undefined): string | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeSearchTerm(input: string | null): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  return trimmed
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .trim() || null
}

function buildBrowseHref(args: {
  offset: number
  rawSearch: string | null
  rawSkills: string | null
  rawRateMin: string | null
  rawRateMax: string | null
  rawLocation: string | null
  rawRemote: string | null
}): string {
  const params = new URLSearchParams()

  if (args.rawSearch?.trim()) params.set('search', args.rawSearch.trim())
  if (args.rawSkills?.trim()) params.set('skills', args.rawSkills.trim())
  if (args.rawRateMin?.trim()) params.set('rate_min', args.rawRateMin.trim())
  if (args.rawRateMax?.trim()) params.set('rate_max', args.rawRateMax.trim())
  if (args.rawLocation?.trim()) params.set('location', args.rawLocation.trim())
  if (args.rawRemote === 'true') params.set('remote', 'true')

  if (args.offset > 0) params.set('offset', args.offset.toString())

  const query = params.toString()
  return query ? `/browse?${query}` : '/browse'
}

async function getBrowseTotalCount(args: {
  rawSearch: string | null
  rawSkills: string | null
}): Promise<number | null> {
  const showcaseConfig = getPublicShowcaseConfig()
  if (shouldFailClosedPublicHumans(showcaseConfig)) {
    return 0
  }

  const normalizedSearch = normalizeSearchTerm(args.rawSearch)
  const skills = (args.rawSkills || '').split(',').map(s => s.trim()).filter(Boolean)

  try {
    const supabase = await createServiceClient()

    let query = supabase
      .from('humans')
      .select('id', { count: 'exact', head: true })

    if (isPublicShowcaseCuratedMode(showcaseConfig)) {
      query = query.in('id', showcaseConfig.humanIds)
    }

    if (skills.length > 0) {
      query = query.overlaps('skills', skills)
    }

    if (normalizedSearch) {
      query = query.or(`name.ilike.%${normalizedSearch}%,bio.ilike.%${normalizedSearch}%`)
    }

    const { error, count } = await query
    if (error) return null
    return count ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const resolved = await searchParams

  const rawOffset = getFirstSearchParam(resolved.offset)
  const rawSearch = getFirstSearchParam(resolved.search) || getFirstSearchParam(resolved.q)
  const rawSkills = getFirstSearchParam(resolved.skills)
  const rawRateMin = getFirstSearchParam(resolved.rate_min)
  const rawRateMax = getFirstSearchParam(resolved.rate_max)
  const rawLocation = getFirstSearchParam(resolved.location)
  const rawRemote = getFirstSearchParam(resolved.remote)

  const offsetResult = parseBoundedIntegerParam(rawOffset, {
    paramName: 'offset',
    min: 0,
    max: 10000,
    defaultValue: 0,
  })
  const offset = offsetResult.ok ? offsetResult.value : 0
  const hasSearch = Boolean(rawSearch?.trim())
  const hasSkills = Boolean(rawSkills?.split(',').filter(Boolean).length)
  const isFilteredView = hasSearch || hasSkills

  const metadata: Metadata = {
    title: 'Browse Humans',
    description: BROWSE_DESCRIPTION,
    alternates: { canonical: '/browse' },
    ...(isFilteredView ? { robots: { index: false, follow: true } } : null),
  }

  if (offset > 0) {
    const previousOffset = Math.max(0, offset - DEFAULT_LIMIT)

    const previous = buildBrowseHref({
      offset: previousOffset,
      rawSearch,
      rawSkills,
      rawRateMin,
      rawRateMax,
      rawLocation,
      rawRemote,
    })

    let next: string | undefined
    const total = await getBrowseTotalCount({ rawSearch, rawSkills })
    if (total === null) {
      next = buildBrowseHref({
        offset: offset + DEFAULT_LIMIT,
        rawSearch,
        rawSkills,
        rawRateMin,
        rawRateMax,
        rawLocation,
        rawRemote,
      })
    } else if (offset + DEFAULT_LIMIT < total) {
      next = buildBrowseHref({
        offset: offset + DEFAULT_LIMIT,
        rawSearch,
        rawSkills,
        rawRateMin,
        rawRateMax,
        rawLocation,
        rawRemote,
      })
    }

    metadata.pagination = { previous, next }
  }

  return metadata
}

export default function BrowseHumansPageWrapper() {
  return <BrowseHumansPage />
}
