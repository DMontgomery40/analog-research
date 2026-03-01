'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { MapPin, Star, DollarSign, Search, Github, Linkedin, Instagram, Youtube, Globe, Twitter } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { QualityFormulaLinks, QualityScoreBadge } from '@/components/quality-score-badge'
import { PublicNav } from '@/components/public-nav'
import { PublicResearchShell } from '@/components/public-research-shell'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { TESTING_DATA_NOTICE } from '@/lib/brand'

interface SocialLinks {
  github?: string
  linkedin?: string
  instagram?: string
  youtube?: string
  website?: string
  x?: string
  website_2?: string
  website_3?: string
}

interface Human {
  id: string
  name: string
  bio: string | null
  avatar_url: string | null
  location: string | null
  drive_radius_miles?: number | null
  timezone: string | null
  skills: string[]
  rate_min: number
  rate_max: number
  rating_average: number
  rating_count: number
  is_verified: boolean
  completed_bookings: number
  human_legitimacy_score?: number
  human_legitimacy_confidence?: number
  social_links?: SocialLinks
}

interface Pagination {
  offset: number
  limit: number
  total: number
}

function parseNonNegativeInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, parsed)
}

const DEFAULT_RATE_MIN_CENTS = 0
const DEFAULT_RATE_MAX_CENTS = 1_000_000 // $10,000/hr — matches API ceiling

function BrowseHumansPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlOffset = useMemo(() => parseNonNegativeInt(searchParams.get('offset'), 0), [searchParams])
  const urlSearch = useMemo(() => (searchParams.get('search') || '').trim(), [searchParams])
  const urlSkills = useMemo(() => (searchParams.get('skills') || '').split(',').filter(Boolean), [searchParams])
  const urlRateMin = useMemo(() => parseNonNegativeInt(searchParams.get('rate_min'), 0) * 100, [searchParams])
  const urlRateMax = useMemo(() => {
    const raw = searchParams.get('rate_max')
    if (!raw) return DEFAULT_RATE_MAX_CENTS
    return Math.min(DEFAULT_RATE_MAX_CENTS, parseNonNegativeInt(raw, DEFAULT_RATE_MAX_CENTS / 100) * 100)
  }, [searchParams])
  const urlDriveRadius = useMemo(() => parseNonNegativeInt(searchParams.get('drive_radius_miles'), 0), [searchParams])
  const urlLocation = useMemo(() => (searchParams.get('location') || '').trim(), [searchParams])
  const urlRemote = useMemo(() => searchParams.get('remote') === 'true', [searchParams])

  const [humans, setHumans] = useState<Human[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(urlSearch)
  const [selectedSkills, setSelectedSkills] = useState<string[]>(urlSkills)
  const [rateMin, setRateMin] = useState<number>(urlRateMin)
  const [rateMax, setRateMax] = useState<number>(urlRateMax)
  const [driveRadius, setDriveRadius] = useState<number | null>(urlDriveRadius > 0 ? urlDriveRadius : null)
  const [locationFilter, setLocationFilter] = useState(urlLocation)
  const [remoteOnly, setRemoteOnly] = useState(urlRemote)
  const [pagination, setPagination] = useState<Pagination>({ offset: 0, limit: 20, total: 0 })
  const [offset, setOffset] = useState(urlOffset)

  const FALLBACK_SKILLS = [
    'Writing', 'Research', 'Data Entry', 'Customer Service', 'Photography',
    'Video Editing', 'Graphic Design', 'Translation', 'Coding', 'Testing'
  ]

  const [allSkills, setAllSkills] = useState<string[]>(FALLBACK_SKILLS)

  useEffect(() => {
    fetch('/api/v1/humans/skills')
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          setAllSkills(result.data)
        }
      })
      .catch(() => {
        // Keep fallback skills on error
      })
  }, [])

  const buildBrowseHref = useCallback((params: URLSearchParams) => {
    const query = params.toString()
    return query ? `/browse?${query}` : '/browse'
  }, [])

  const buildFilterParams = useCallback((overrides: { offset?: number; search?: string }) => {
    const params = new URLSearchParams()

    const search = overrides.search !== undefined ? overrides.search.trim() : urlSearch
    if (search) params.set('search', search)

    const nextOffset = overrides.offset !== undefined ? Math.max(0, overrides.offset) : offset
    if (nextOffset > 0) params.set('offset', nextOffset.toString())

    if (selectedSkills.length > 0) params.set('skills', selectedSkills.join(','))
    if (rateMin > DEFAULT_RATE_MIN_CENTS) params.set('rate_min', (rateMin / 100).toString())
    if (rateMax < DEFAULT_RATE_MAX_CENTS) params.set('rate_max', (rateMax / 100).toString())
    if (driveRadius && driveRadius > 0) params.set('drive_radius_miles', driveRadius.toString())
    if (locationFilter) params.set('location', locationFilter)
    if (remoteOnly) params.set('remote', 'true')

    return params
  }, [urlSearch, offset, selectedSkills, rateMin, rateMax, driveRadius, locationFilter, remoteOnly])

  const replaceBrowseParams = useCallback((next: { offset?: number; search?: string }) => {
    router.replace(buildBrowseHref(buildFilterParams(next)))
  }, [buildBrowseHref, buildFilterParams, router])

  const pushBrowseParams = useCallback((next: { offset?: number; search?: string }) => {
    router.push(buildBrowseHref(buildFilterParams(next)))
  }, [buildBrowseHref, buildFilterParams, router])

  useEffect(() => {
    setOffset(urlOffset)
  }, [urlOffset])

  useEffect(() => {
    setSearchInput(urlSearch)
  }, [urlSearch])

  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === urlSearch) return

    const handle = setTimeout(() => {
      setOffset(0)
      replaceBrowseParams({ search: trimmed, offset: 0 })
    }, 300)

    return () => clearTimeout(handle)
  }, [replaceBrowseParams, searchInput, urlSearch])

  // Reset to page 1 and sync URL when filters change
  const filtersKey = `${selectedSkills.join(',')}|${rateMin}|${rateMax}|${driveRadius ?? ''}|${locationFilter}|${remoteOnly}`
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey)
  useEffect(() => {
    if (filtersKey === prevFiltersKey) return
    setPrevFiltersKey(filtersKey)
    setOffset(0)
    replaceBrowseParams({ offset: 0 })
  }, [filtersKey, prevFiltersKey, replaceBrowseParams])

  const fetchHumans = useCallback(async (nextOffset: number, search: string) => {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams()
      params.append('offset', nextOffset.toString())
      params.append('limit', '20')
      if (search) params.append('search', search)

      if (selectedSkills.length > 0) {
        params.append('skills', selectedSkills.join(','))
      }
      if (rateMin > DEFAULT_RATE_MIN_CENTS) {
        params.append('min_rate', rateMin.toString())
      }
      if (rateMax < DEFAULT_RATE_MAX_CENTS) {
        params.append('max_rate', rateMax.toString())
      }
      if (driveRadius && driveRadius > 0) {
        params.append('drive_radius_miles', driveRadius.toString())
      }
      if (locationFilter) {
        params.append('location', locationFilter)
      }
      if (remoteOnly) {
        params.append('is_remote', 'true')
      }

      const response = await fetch(`/api/v1/humans?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        const total = result.pagination?.total || result.data?.length || 0
        const limit = result.pagination?.limit || 20
        const lastOffset = total > 0 ? Math.floor((total - 1) / limit) * limit : 0

        if (nextOffset > lastOffset) {
          setOffset(lastOffset)
          replaceBrowseParams({ offset: lastOffset })
          return
        }

        setHumans(result.data || [])
        setPagination({
          offset: nextOffset,
          limit,
          total,
        })
      } else {
        setFetchError(result.error || 'Failed to load humans. Please try again.')
        setHumans([])
      }
    } catch (error) {
      console.error('Failed to fetch humans:', error)
      setFetchError('Failed to load humans. Please try again.')
      setHumans([])
    } finally {
      setLoading(false)
    }
  }, [driveRadius, locationFilter, rateMax, rateMin, remoteOnly, replaceBrowseParams, selectedSkills])

  useEffect(() => {
    void fetchHumans(offset, urlSearch)
  }, [fetchHumans, offset, urlSearch])

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit))
  const currentPage = Math.min(totalPages, Math.floor(pagination.offset / pagination.limit) + 1)

  const goToPage = (page: number) => {
    const clampedPage = Math.min(Math.max(1, page), totalPages)
    const nextOffset = (clampedPage - 1) * pagination.limit
    setOffset(nextOffset)
    pushBrowseParams({ offset: nextOffset })
  }

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev =>
      prev.includes(skill)
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    )
  }

  const socialMeta: Array<{
    key: keyof SocialLinks
    label: string
    icon: LucideIcon
  }> = [
    { key: 'website', label: 'Website', icon: Globe },
    { key: 'website_2', label: 'Website 2', icon: Globe },
    { key: 'website_3', label: 'Website 3', icon: Globe },
    { key: 'github', label: 'GitHub', icon: Github },
    { key: 'x', label: 'X', icon: Twitter },
    { key: 'linkedin', label: 'LinkedIn', icon: Linkedin },
    { key: 'instagram', label: 'Instagram', icon: Instagram },
    { key: 'youtube', label: 'YouTube', icon: Youtube },
  ]

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <PublicResearchShell section="humans">
        <Breadcrumbs
          className="mb-4"
          items={[
            { name: 'Home', href: '/' },
            { name: 'Browse Humans', href: '/browse' },
          ]}
        />
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Browse Humans</h1>
          <p className="text-muted-foreground">Find skilled humans available for research and field assignments.</p>
          <p className="mt-2 rounded-md border border-amber-300/50 bg-amber-100/70 px-3 py-2 text-sm text-amber-950">
            {TESTING_DATA_NOTICE}
          </p>
          <QualityFormulaLinks className="mt-2" />
        </div>

        <div className="clinical-panel p-6 mb-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or bio..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            </div>

          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block">Skills</label>
            <div className="flex flex-wrap gap-2">
              {allSkills.map(skill => (
                <button
                  key={skill}
                  onClick={() => toggleSkill(skill)}
                  aria-pressed={selectedSkills.includes(skill)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    selectedSkills.includes(skill)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Min Rate ($/hr)</label>
              <input
                type="number"
                value={rateMin / 100}
                onChange={(e) => setRateMin(Math.max(0, parseInt(e.target.value) || 0) * 100)}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Max Rate ($/hr)</label>
              <input
                type="number"
                value={rateMax / 100}
                onChange={(e) => {
                  const dollars = parseInt(e.target.value) || 0
                  setRateMax(Math.min(DEFAULT_RATE_MAX_CENTS, Math.max(0, dollars) * 100))
                }}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Travel needed (mi)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={driveRadius ?? ''}
                onChange={(e) => {
                  const raw = e.target.value
                  const parsed = raw === '' ? null : Math.max(0, Number.parseInt(raw, 10) || 0)
                  setDriveRadius(parsed)
                }}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="25"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Filters for humans willing to travel at least this far.
              </p>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block">Location</label>
            <input
              type="text"
              placeholder="City, State, or Country"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(e) => setRemoteOnly(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm">Remote available</span>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : fetchError ? (
          <div className="bg-card border border-destructive/50 rounded-xl p-12 text-center">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4">{fetchError}</p>
            <button
              onClick={() => fetchHumans(offset, urlSearch)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : humans.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <h2 className="text-xl font-semibold mb-2">No humans found</h2>
            <p className="text-muted-foreground">
              Try adjusting your filters or search query
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {humans.map((human, index) => {
              const driveRadiusLabel = typeof human.drive_radius_miles === 'number'
                ? (human.drive_radius_miles === 0 ? 'Remote only' : `Within ${human.drive_radius_miles} mi`)
                : null

              return (
                <div
                  key={human.id}
                  className="rounded-2xl bg-gradient-to-br from-background/80 via-background/70 to-muted/40 p-[1px] shadow-[0_20px_60px_-50px_rgba(0,0,0,0.9)] motion-safe:animate-fade-up"
                  style={{ animationDelay: `${Math.min(index * 0.04, 0.2)}s` }}
                >
                  <div className="rounded-2xl border border-border/60 bg-card/80 p-5 transition-colors hover:border-primary/40">
                    <div className="flex items-start gap-4 mb-4">
                      {human.avatar_url ? (
                        <img
                          src={human.avatar_url}
                          alt={human.name}
                          className="w-16 h-16 rounded-full object-cover ring-2 ring-primary/30"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl font-semibold text-muted-foreground ring-2 ring-primary/20">
                          {human.name[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{human.name}</h3>
                          <QualityScoreBadge
                            label="HLS"
                            score={human.human_legitimacy_score}
                            confidence={human.human_legitimacy_confidence}
                          />
                        </div>
                        {(human.location || driveRadiusLabel) && (
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            {human.location && <span className="truncate">{human.location}</span>}
                            {driveRadiusLabel && (
                              <span className="rounded-full border border-border/60 px-2 py-0.5">
                                {driveRadiusLabel}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                      {human.bio || 'No bio provided'}
                    </p>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {human.skills.slice(0, 3).map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full bg-gradient-to-r from-primary/40 to-amber-500/30 p-[1px]"
                        >
                          <span className="block rounded-full bg-background/80 px-3 py-1 text-[11px] font-medium text-foreground">
                            {skill}
                          </span>
                        </span>
                      ))}
                      {human.skills.length > 3 && (
                        <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
                          +{human.skills.length - 3}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <DollarSign className="w-4 h-4" />
                        <span>${human.rate_min / 100}-${human.rate_max / 100}/hr</span>
                      </div>
                      {human.rating_count > 0 && (
                        <div className="flex items-center gap-1 text-amber-400">
                          <Star className="w-4 h-4 fill-current" />
                          <span className="text-foreground">{human.rating_average.toFixed(1)}</span>
                          <span className="text-muted-foreground">({human.rating_count})</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-border/70 flex items-center justify-between gap-3">
                      <Link
                        href={`/humans/${human.id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        View profile
                      </Link>

                      <div className="flex items-center gap-2">
                        {socialMeta.map(({ key, label, icon: Icon }) => {
                          const href = human.social_links?.[key]
                          if (!href) {
                            return null
                          }

                          return (
                            <a
                              key={key}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={label}
                              title={label}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                            >
                              <Icon className="w-4 h-4" />
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
            >
              Previous
            </button>

            <div className="text-sm text-muted-foreground">
              Page <span className="text-foreground font-medium">{currentPage}</span> of{' '}
              <span className="text-foreground font-medium">{totalPages}</span>
            </div>

            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </PublicResearchShell>
    </div>
  )
}

export default function BrowseHumansPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <BrowseHumansPageInner />
    </Suspense>
  )
}
