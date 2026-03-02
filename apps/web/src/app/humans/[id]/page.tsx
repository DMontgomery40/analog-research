import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  MapPin,
  Star,
  DollarSign,
  CheckCircle2,
  Github,
  Linkedin,
  Instagram,
  Youtube,
  Globe,
  Twitter,
  CalendarDays,
  Briefcase,
  Clock,
} from 'lucide-react'
import { QualityFormulaLinks, QualityScoreBadge } from '@/components/quality-score-badge'
import { PublicNav } from '@/components/public-nav'
import { ContactHuman } from '@/components/contact-human'
import { ShareProfileButton } from '@/components/share-profile-button'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { coerceSocialLinksFromRow } from '@/lib/social-links'
import { formatDate } from '@/lib/format-date'
import { logger } from '@/lib/logger'
import { getPublicShowcaseConfig, isHumanPubliclyVisible } from '@/lib/public-showcase'
import { isMissingColumnError } from '@/lib/supabase/errors'
import { TESTING_DATA_NOTICE } from '@/lib/brand'

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

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
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
  availability: AvailabilitySchedule
  rating_average: number
  rating_count: number
  is_verified: boolean
  completed_bookings: number
  created_at: string
  human_legitimacy_score?: number
  human_legitimacy_confidence?: number
  social_links?: {
    github?: string
    linkedin?: string
    instagram?: string
    youtube?: string
    website?: string
    x?: string
    website_2?: string
    website_3?: string
  }
  recent_reviews?: Review[]
}

type GetHumanResult =
  | { kind: 'found'; human: Human }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }

const humanProfileLog = logger.withContext('app/humans/[id]/page.tsx', 'getHuman')

async function getHuman(id: string): Promise<GetHumanResult> {
  try {
    const showcaseConfig = getPublicShowcaseConfig()
    if (!isHumanPubliclyVisible(id, showcaseConfig)) {
      return { kind: 'not_found' }
    }

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
      .maybeSingle()

    let data = preferredResult.data as Human | null
    let error = preferredResult.error

    // Stay compatible with environments that haven't migrated drive_radius_miles yet.
    if (isMissingColumnError(error, { column: 'drive_radius_miles', table: 'humans' })) {
      const fallbackResult = await supabase
        .from('humans')
        .select(fallbackSelect)
        .eq('id', id)
        .maybeSingle()

      data = fallbackResult.data as Human | null
      error = fallbackResult.error
    }

    if (error) {
      humanProfileLog.error('Failed to fetch human profile', { humanId: id }, { message: error.message, code: error.code })
      return { kind: 'error', message: 'Failed to load profile. Please try again later.' }
    }

    if (!data) {
      return { kind: 'not_found' }
    }

    const { data: reviews } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at')
      .eq('reviewee_id', id)
      .eq('reviewee_type', 'human')
      .order('created_at', { ascending: false })
      .limit(5)

    return {
      kind: 'found',
      human: {
        ...data,
        social_links: coerceSocialLinksFromRow(data),
        recent_reviews: reviews || [],
      },
    }
  } catch (err) {
    humanProfileLog.error(
      'Unexpected error loading human profile',
      { humanId: id },
      err instanceof Error ? { message: err.message } : { message: String(err) }
    )
    return { kind: 'error', message: 'An unexpected error occurred. Please try again later.' }
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const result = await getHuman(id)
  if (result.kind !== 'found') {
    return { title: 'Human Profile' }
  }

  const canonicalPath = `/humans/${result.human.id}`
  const description = buildHumanProfileDescription(result.human)

  return {
    title: result.human.name,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'profile',
      title: result.human.name,
      description,
      url: canonicalPath,
      images: [
        {
          url: `/humans/${result.human.id}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `${result.human.name} on Analog Research`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: result.human.name,
      description,
      images: [`/humans/${result.human.id}/opengraph-image`],
    },
  }
}

const DAYS: (keyof AvailabilitySchedule)[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
]

const DAY_MAP: Record<string, keyof AvailabilitySchedule> = {
  sun: 'sunday',
  mon: 'monday',
  tue: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  fri: 'friday',
  sat: 'saturday',
}

const TIME_SLOTS = Array.from({ length: 36 }, (_, i) => {
  const hour = Math.floor(i / 2) + 6
  const minute = i % 2 === 0 ? '00' : '30'
  return `${hour.toString().padStart(2, '0')}:${minute}`
})

function normalizeTime(t: string): string {
  const [h, m] = t.split(':')
  return `${(h || '0').padStart(2, '0')}:${(m || '00').padStart(2, '0')}`
}

function getLocalTimeParts(timezone?: string | null): { weekday: string; time: string } {
  const now = new Date()

  if (timezone) {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      const parts = formatter.formatToParts(now)
      const weekday = parts.find((part) => part.type === 'weekday')?.value
      const hour = parts.find((part) => part.type === 'hour')?.value
      const minute = parts.find((part) => part.type === 'minute')?.value
      if (weekday && hour && minute) {
        return {
          weekday: weekday.toLowerCase().slice(0, 3),
          time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
        }
      }
    } catch {
      // Fall through to local time fallback.
    }
  }

  const fallbackWeekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()] || 'mon'
  const fallbackTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  return { weekday: fallbackWeekday, time: fallbackTime }
}

function getAvailabilityBadge(availability: AvailabilitySchedule, timezone?: string | null) {
  if (!availability || Object.keys(availability).length === 0) return null

  const { weekday, time } = getLocalTimeParts(timezone)
  const dayKey = DAY_MAP[weekday]
  if (!dayKey) return null

  const slots = availability[dayKey] || []
  if (!slots.length) return null

  const isNow = slots.some((slot) => time >= normalizeTime(slot.start) && time < normalizeTime(slot.end))

  return {
    label: isNow ? 'Available now' : 'Available today',
    tone: isNow ? 'now' : 'today',
  }
}

function buildHumanProfileDescription(human: Human): string {
  const bio = (human.bio || '').replace(/\s+/g, ' ').trim()
  if (bio) return truncateText(bio, 160)

  const skillList =
    human.skills && human.skills.length > 0 ? ` Skills: ${human.skills.slice(0, 6).join(', ')}.` : ''

  return truncateText(
    `Hire ${human.name} on Analog Research for real-world tasks and project-based work.${skillList}`.trim(),
    160
  )
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`
}

function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

function buildHumanPersonJsonLd(human: Human): Record<string, unknown> {
  const profileUrl = `https://analog-research.org/humans/${human.id}`

  const sameAs = [
    human.social_links?.website,
    human.social_links?.website_2,
    human.social_links?.website_3,
    human.social_links?.github,
    human.social_links?.x,
    human.social_links?.linkedin,
    human.social_links?.instagram,
    human.social_links?.youtube,
  ].filter((value): value is string => Boolean(value))

  const person: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: human.name,
    description: buildHumanProfileDescription(human),
    url: profileUrl,
    ...(human.avatar_url ? { image: human.avatar_url } : {}),
    ...(human.skills && human.skills.length > 0 ? { knowsAbout: human.skills } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
    makesOffer: {
      '@type': 'Offer',
      url: profileUrl,
      price: human.rate_min / 100,
      priceCurrency: 'USD',
    },
  }

  if (human.rating_count > 0) {
    person.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(human.rating_average.toFixed(1)),
      reviewCount: human.rating_count,
    }
  } else if (human.recent_reviews && human.recent_reviews.length > 0) {
    const ratingSum = human.recent_reviews.reduce((sum, review) => sum + review.rating, 0)
    const ratingAverage = ratingSum / human.recent_reviews.length
    person.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(ratingAverage.toFixed(1)),
      reviewCount: human.recent_reviews.length,
    }
  }

  return person
}

function formatRateRange(rateMin: number, rateMax: number): string {
  if (rateMin <= 0 && rateMax <= 0) return 'Rate on request'
  const min = rateMin > 0 ? `$${(rateMin / 100).toFixed(0)}` : null
  const max = rateMax > 0 ? `$${(rateMax / 100).toFixed(0)}` : null
  if (min && max && rateMax > rateMin) return `${min} - ${max}/hr`
  return `${max || min}/hr`
}

function formatMemberSince(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export default async function HumanProfilePage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getHuman(id)

  if (result.kind === 'not_found') {
    notFound()
  }

  if (result.kind === 'error') {
    return (
      <div className="min-h-screen bg-background">
        <PublicNav />
        <div className="max-w-5xl mx-auto p-6">
          <Breadcrumbs
            className="mb-6"
            items={[
              { name: 'Home', href: '/' },
              { name: 'Browse Humans', href: '/browse' },
              { name: 'Human Profile', href: `/humans/${id}` },
            ]}
          />
          <p className="mb-6 rounded-md border border-amber-300/50 bg-amber-100/70 px-3 py-2 text-sm text-amber-950">
            {TESTING_DATA_NOTICE}
          </p>
          <p className="mb-6 text-xs text-muted-foreground">
            Full endpoints + parameters:{' '}
            <Link href="/api-docs#humans" className="text-primary hover:underline">REST</Link>
            {' · '}
            <Link href="/mcp#tools" className="text-primary hover:underline">MCP tools</Link>
          </p>
          <div className="bg-card border border-destructive/50 rounded-xl p-12 text-center">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground">{result.message}</p>
          </div>
        </div>
      </div>
    )
  }

  const human = result.human
  const personJsonLd = buildHumanPersonJsonLd(human)
  const profileUrl = `https://analog-research.org/humans/${human.id}`

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let viewerHumanId: string | null = null

  if (user) {
    const { data: viewerHuman } = await supabase
      .from('humans')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    viewerHumanId = viewerHuman?.id ?? null
  }

  const availability = (human.availability || {}) as AvailabilitySchedule
  const availabilityBadge = getAvailabilityBadge(availability, human.timezone)
  const rateRange = formatRateRange(human.rate_min, human.rate_max)
  const memberSince = formatMemberSince(human.created_at)
  const skillTagline = human.skills && human.skills.length > 0 ? human.skills.slice(0, 3).join(' / ') : null
  const driveRadiusLabel = typeof human.drive_radius_miles === 'number'
    ? (human.drive_radius_miles === 0 ? 'Remote only' : `Within ${human.drive_radius_miles} mi`)
    : null

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(personJsonLd) }}
      />
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <Breadcrumbs
          className="mb-6"
          items={[
            { name: 'Home', href: '/' },
            { name: 'Browse Humans', href: '/browse' },
            { name: human.name, href: `/humans/${human.id}` },
          ]}
        />
        <p className="mb-6 rounded-md border border-amber-300/50 bg-amber-100/70 px-3 py-2 text-sm text-amber-950">
          {TESTING_DATA_NOTICE}
        </p>
        <p className="mb-6 text-xs text-muted-foreground">
          Full endpoints + parameters:{' '}
          <Link href="/api-docs#humans" className="text-primary hover:underline">REST</Link>
          {' · '}
          <Link href="/mcp#tools" className="text-primary hover:underline">MCP tools</Link>
        </p>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] gap-8">
          <div className="space-y-8">
            <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 via-card/60 to-card/40 p-8 shadow-[0_30px_80px_-60px_rgba(0,0,0,0.9)] lg:p-10 motion-safe:animate-fade-up">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute -bottom-32 -left-20 h-64 w-64 rounded-full bg-amber-500/10 blur-[120px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%)]" />
              </div>

              <div className="relative flex flex-col gap-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                  <div className="relative h-28 w-28 shrink-0">
                    {human.avatar_url ? (
                      <img
                        src={human.avatar_url}
                        alt={human.name}
                        className="h-28 w-28 rounded-full object-cover ring-2 ring-primary/40"
                      />
                    ) : (
                      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-muted text-4xl font-semibold text-muted-foreground ring-2 ring-primary/30">
                        {human.name[0].toUpperCase()}
                      </div>
                    )}
                    <span className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full border border-primary/30 bg-background/80 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.7)]" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">{human.name}</h1>
                      {human.is_verified && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" />
                          Verified
                        </span>
                      )}
                      <QualityScoreBadge
                        label="HLS"
                        score={human.human_legitimacy_score}
                        confidence={human.human_legitimacy_confidence}
                        className="text-[11px]"
                      />
                      {availabilityBadge && (
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${availabilityBadge.tone === 'now'
                            ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                            : 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                          }`}
                        >
                          {availabilityBadge.label}
                        </span>
                      )}
                      <ShareProfileButton url={profileUrl} title={human.name} />
                    </div>

                    {skillTagline && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {skillTagline}
                      </p>
                    )}

                    {(human.location || driveRadiusLabel) && (
                      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {human.location && <span>{human.location}</span>}
                        {driveRadiusLabel && (
                          <span className="text-xs rounded-full border border-border/60 px-2 py-0.5">
                            {driveRadiusLabel}
                          </span>
                        )}
                        {human.timezone && <span className="text-xs">({human.timezone})</span>}
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      {human.social_links?.website && (
                        <a
                          href={human.social_links.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        >
                          <Globe className="h-3.5 w-3.5" />
                          Website
                        </a>
                      )}
                      {human.social_links?.website_2 && (
                        <a
                          href={human.social_links.website_2}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        >
                          <Globe className="h-3.5 w-3.5" />
                          Website 2
                        </a>
                      )}
                      {human.social_links?.website_3 && (
                        <a
                          href={human.social_links.website_3}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        >
                          <Globe className="h-3.5 w-3.5" />
                          Website 3
                        </a>
                      )}
                      {human.social_links?.github && (
                        <a
                          href={human.social_links.github}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        >
                          <Github className="h-3.5 w-3.5" />
                          GitHub
                        </a>
                      )}
                      {human.social_links?.x && (
                        <a
                          href={human.social_links.x}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        >
                          <Twitter className="h-3.5 w-3.5" />
                          X
                        </a>
                      )}
                      {human.social_links?.linkedin && (
                        <a
                          href={human.social_links.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                          LinkedIn
                        </a>
                      )}
                      {human.social_links?.instagram && (
                        <a
                          href={human.social_links.instagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        >
                          <Instagram className="h-3.5 w-3.5" />
                          Instagram
                        </a>
                      )}
                      {human.social_links?.youtube && (
                        <a
                          href={human.social_links.youtube}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        >
                          <Youtube className="h-3.5 w-3.5" />
                          YouTube
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <DollarSign className="h-4 w-4" />
                      Rate
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{rateRange}</p>
                    <p className="text-xs text-muted-foreground">Escrow protected</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <Briefcase className="h-4 w-4" />
                      Completed jobs
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {human.completed_bookings}
                    </p>
                    <p className="text-xs text-muted-foreground">Recent activity</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                      Member since
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{memberSince}</p>
                    <p className="text-xs text-muted-foreground">Profile active</p>
                  </div>
                </div>
              </div>
            </section>

            {human.bio && (
              <section
                className="rounded-2xl border border-border/60 bg-gradient-to-br from-background/80 via-background/70 to-muted/40 p-6 shadow-[0_20px_60px_-50px_rgba(0,0,0,0.9)] motion-safe:animate-fade-up"
                style={{ animationDelay: '0.05s' }}
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-1 w-10 rounded-full bg-primary/60" />
                  <h2 className="text-lg font-semibold">About</h2>
                </div>
                <div className="prose prose-invert max-w-none text-muted-foreground">
                  <p className="whitespace-pre-wrap">{human.bio}</p>
                </div>
              </section>
            )}

            {human.skills && human.skills.length > 0 && (
              <section
                className="rounded-2xl border border-border/60 bg-gradient-to-br from-background/80 via-background/70 to-muted/40 p-6 shadow-[0_20px_60px_-50px_rgba(0,0,0,0.9)] motion-safe:animate-fade-up"
                style={{ animationDelay: '0.1s' }}
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-1 w-10 rounded-full bg-primary/60" />
                  <h2 className="text-lg font-semibold">Skills</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {human.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-gradient-to-r from-primary/40 to-amber-500/30 p-[1px]"
                    >
                      <span className="block rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-foreground">
                        {skill}
                      </span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {availability && Object.keys(availability).length > 0 && (
              <section
                className="rounded-2xl border border-border/60 bg-gradient-to-br from-background/80 via-background/70 to-muted/40 p-6 shadow-[0_20px_60px_-50px_rgba(0,0,0,0.9)] motion-safe:animate-fade-up"
                style={{ animationDelay: '0.15s' }}
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-1 w-10 rounded-full bg-primary/60" />
                  <h2 className="text-lg font-semibold">Availability</h2>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[600px] overflow-hidden rounded-xl border border-border/60">
                    <div className="grid grid-cols-8 gap-px bg-border/40 text-xs">
                      <div className="bg-card/80 p-2" />
                      {DAYS.map((day) => (
                        <div key={day} className="bg-card/80 p-2 text-center font-semibold uppercase tracking-wide">
                          {day.slice(0, 3)}
                        </div>
                      ))}

                      {TIME_SLOTS.map((time, timeIdx) => (
                        <div key={time} className="contents">
                          <div className="bg-card/70 p-2 text-xs text-muted-foreground">
                            {timeIdx % 2 === 0 ? time : ''}
                          </div>
                          {DAYS.map((day) => {
                            const slots = availability[day] || []
                            const isAvailable = slots.some(
                              (slot) => time >= normalizeTime(slot.start) && time < normalizeTime(slot.end)
                            )
                            return (
                              <div
                                key={`${day}-${time}`}
                                className={`p-2 ${isAvailable ? 'bg-primary/30' : 'bg-card/70'}`}
                              />
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {human.recent_reviews && human.recent_reviews.length > 0 && (
              <section
                className="rounded-2xl border border-border/60 bg-gradient-to-br from-background/80 via-background/70 to-muted/40 p-6 shadow-[0_20px_60px_-50px_rgba(0,0,0,0.9)] motion-safe:animate-fade-up"
                style={{ animationDelay: '0.2s' }}
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-1 w-10 rounded-full bg-primary/60" />
                  <h2 className="text-lg font-semibold">Recent Reviews</h2>
                </div>
                <div className="space-y-4">
                  {human.recent_reviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-xl border border-border/60 bg-background/70 p-4 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.8)]"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < review.rating
                                ? 'text-amber-400 fill-current'
                                : 'text-muted-foreground'
                            }`}
                          />
                        ))}
                        <span className="text-xs text-muted-foreground">
                          {formatDate(review.created_at)}
                        </span>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-muted-foreground">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="mt-8 space-y-6 lg:mt-0 lg:sticky lg:top-24 self-start">
            <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-background/80 via-background/70 to-muted/40 p-5 shadow-[0_20px_60px_-50px_rgba(0,0,0,0.9)]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Quick Facts</p>
                {availabilityBadge && (
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${availabilityBadge.tone === 'now'
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                    }`}
                  >
                    {availabilityBadge.label}
                  </span>
                )}
              </div>
              <div className="mt-4 space-y-4 text-sm">
                {human.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-1 h-4 w-4 text-primary/80" />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Location</p>
                      <p className="font-medium text-foreground">{human.location}</p>
                    </div>
                  </div>
                )}
                {human.timezone && (
                  <div className="flex items-start gap-3">
                    <Clock className="mt-1 h-4 w-4 text-primary/80" />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Timezone</p>
                      <p className="font-medium text-foreground">{human.timezone}</p>
                    </div>
                  </div>
                )}
                {driveRadiusLabel && (
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-1 h-4 w-4 text-primary/80" />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Drive radius</p>
                      <p className="font-medium text-foreground">{driveRadiusLabel}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <DollarSign className="mt-1 h-4 w-4 text-primary/80" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Rate range</p>
                    <p className="font-medium text-foreground">{rateRange}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Briefcase className="mt-1 h-4 w-4 text-primary/80" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Completed jobs</p>
                    <p className="font-medium text-foreground">{human.completed_bookings}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Star className="mt-1 h-4 w-4 text-primary/80" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Reviews</p>
                    <p className="font-medium text-foreground">
                      {human.rating_count > 0
                        ? `${human.rating_average.toFixed(1)} (${human.rating_count})`
                        : 'No reviews yet'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-4 w-4 text-primary/80" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">HLS</p>
                    <QualityScoreBadge
                      label="HLS"
                      score={human.human_legitimacy_score}
                      confidence={human.human_legitimacy_confidence}
                      className="text-[11px]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <ContactHuman
              humanId={human.id}
              humanName={human.name}
              viewerUserId={user?.id ?? null}
              viewerHumanId={viewerHumanId}
            />

            <QualityFormulaLinks className="text-xs" />
          </aside>
        </div>
      </div>
    </div>
  )
}
