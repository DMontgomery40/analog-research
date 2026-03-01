'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AvailabilityScheduler } from '@/components/availability-scheduler'
import { RateRangeSlider } from '@/components/rate-range-slider'
import { SkillsInput } from '@/components/skills-input'
import { Save, Upload, ExternalLink, CheckCircle2, Circle, CircleHelp } from 'lucide-react'
import { QualityFormulaLinks, QualityScoreBadge } from '@/components/quality-score-badge'
import type { Human, AvailabilitySchedule } from '@analoglabor/database/types'
import { coerceSocialLinksFromRow, type SocialLinks } from '@/lib/social-links'
import { logger } from '@/lib/logger'

const profileLog = logger.withContext('app/(dashboard)/dashboard/profile/page.tsx', 'ProfilePage')

interface ProfileField {
  name: string
  label: string
  required: boolean
  check: (human: Partial<Human>) => boolean
}

interface PayoutWaitlistPreferences {
  paypal_waitlist: boolean
  venmo_waitlist: boolean
}

const PROFILE_FIELDS: ProfileField[] = [
  { name: 'name', label: 'Name', required: true, check: (h) => !!h.name?.trim() },
  { name: 'bio', label: 'Bio', required: true, check: (h) => !!h.bio?.trim() },
  { name: 'avatar_url', label: 'Profile photo', required: false, check: (h) => !!h.avatar_url },
  { name: 'location', label: 'Location', required: true, check: (h) => !!h.location?.trim() },
  { name: 'drive_radius_miles', label: 'Drive radius', required: false, check: (h) => h.drive_radius_miles !== undefined && h.drive_radius_miles !== null },
  { name: 'timezone', label: 'Timezone', required: true, check: (h) => !!h.timezone },
  { name: 'skills', label: 'Skills', required: true, check: (h) => (h.skills?.length || 0) > 0 },
  { name: 'rate', label: 'Hourly rate', required: true, check: (h) => !!h.rate_min && !!h.rate_max },
  { name: 'availability', label: 'Availability', required: true, check: (h) => {
    const avail = h.availability as Record<string, unknown> || {}
    return Object.keys(avail).length > 0
  }},
  { name: 'wallet_address', label: 'Crypto wallet', required: false, check: (h) => !!h.wallet_address?.trim() },
]

function getProfileCompleteness(human: Partial<Human>): { percentage: number; missing: string[] } {
  const completed = PROFILE_FIELDS.filter(f => f.check(human))
  const missing = PROFILE_FIELDS.filter(f => f.required && !f.check(human)).map(f => f.label)
  const percentage = Math.round((completed.length / PROFILE_FIELDS.length) * 100)
  return { percentage, missing }
}

function socialLinksFromProfile(human: Partial<Human>): SocialLinks {
  return coerceSocialLinksFromRow(
    {
      social_links: human.social_links,
      github_url: human.github_url,
      linkedin_url: human.linkedin_url,
      instagram_url: human.instagram_url,
      youtube_url: human.youtube_url,
      website_url: human.website_url,
    },
    { includePrivate: true }
  )
}

function toApiError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Failed to save profile'
  }

  const typedPayload = payload as {
    error?: unknown
    details?: unknown
  }

  if (Array.isArray(typedPayload.details) && typedPayload.details.length > 0) {
    return typedPayload.details.join(', ')
  }

  if (typeof typedPayload.error === 'string' && typedPayload.error.length > 0) {
    return typedPayload.error
  }

  return 'Failed to save profile'
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connectingStripe, setConnectingStripe] = useState(false)
  const [syncingStripeStatus, setSyncingStripeStatus] = useState(false)
  const [stripeConnectError, setStripeConnectError] = useState<string | null>(null)
  const [stripeRedirectUrl, setStripeRedirectUrl] = useState<string | null>(null)
  const [showBankPayoutHelp, setShowBankPayoutHelp] = useState(false)
  const [payoutWaitlistLoading, setPayoutWaitlistLoading] = useState(true)
  const [updatingWaitlistProvider, setUpdatingWaitlistProvider] = useState<'paypal' | 'venmo' | null>(null)
  const [payoutWaitlistPreferences, setPayoutWaitlistPreferences] = useState<PayoutWaitlistPreferences>({
    paypal_waitlist: false,
    venmo_waitlist: false,
  })
  const [human, setHuman] = useState<Partial<Human>>({
    name: '',
    bio: '',
    location: '',
    drive_radius_miles: null,
    timezone: '',
    skills: [],
    rate_min: 2500,
    rate_max: 10000,
    availability: {},
    wallet_address: '',
    github_url: '',
    linkedin_url: '',
    instagram_url: '',
    youtube_url: '',
    website_url: '',
    social_links: {},
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [profileLoadFailed, setProfileLoadFailed] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const socialLinks = socialLinksFromProfile(human)

  function setLegacySocialLink(
    column: 'github_url' | 'linkedin_url' | 'instagram_url' | 'youtube_url' | 'website_url',
    key: 'github' | 'linkedin' | 'instagram' | 'youtube' | 'website',
    value: string
  ) {
    setHuman((prev) => {
      const nextLinks = socialLinksFromProfile(prev)
      if (value.trim()) {
        nextLinks[key] = value
      } else {
        delete nextLinks[key]
      }

      return {
        ...prev,
        [column]: value,
        social_links: nextLinks as Human['social_links'],
      }
    })
  }

  function setExtendedSocialLink(key: 'x' | 'website_2' | 'website_3' | 'contact_email', value: string) {
    setHuman((prev) => {
      const nextLinks = socialLinksFromProfile(prev)
      if (value.trim()) {
        nextLinks[key] = value
      } else {
        delete nextLinks[key]
      }

      return {
        ...prev,
        social_links: nextLinks as Human['social_links'],
      }
    })
  }

  const syncStripeConnectStatus = useCallback(async () => {
    setSyncingStripeStatus(true)
    try {
      const response = await fetch('/api/v1/humans/me/stripe-connect/sync', {
        method: 'POST',
      })

      const payload = await response.json().catch(() => null)
      if (response.ok && payload?.success) {
        const syncedStatus = Boolean(payload.data?.stripe_onboarding_complete)
        setHuman((prev) => ({
          ...prev,
          stripe_onboarding_complete: syncedStatus,
        }))
      }
    } finally {
      setSyncingStripeStatus(false)
    }
  }, [])

  const loadPayoutWaitlistPreferences = useCallback(async () => {
    setPayoutWaitlistLoading(true)
    try {
      const response = await fetch('/api/v1/humans/me/payout-preferences')
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        return
      }

      setPayoutWaitlistPreferences({
        paypal_waitlist: Boolean(payload.data?.paypal_waitlist),
        venmo_waitlist: Boolean(payload.data?.venmo_waitlist),
      })
    } finally {
      setPayoutWaitlistLoading(false)
    }
  }, [])

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        const { data, error: profileError } = await supabase
          .from('humans')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)

        if (profileError) {
          profileLog.error(
            'Failed to load profile',
            {},
            { message: profileError.message, code: profileError.code }
          )
          setProfileLoadFailed(true)
          setError('Failed to load your profile. Refresh and try again before saving changes.')
          return
        }

        if (data && data.length > 0) {
          setHuman(data[0])
          setProfileLoadFailed(false)
          return
        }

        setHuman((prev) => ({
          ...prev,
          name: user.user_metadata?.name || '',
        }))
        setProfileLoadFailed(false)
      } catch (loadError) {
        profileLog.error(
          'Unexpected profile load failure',
          {},
          loadError instanceof Error ? { message: loadError.message } : { message: String(loadError) }
        )
        setProfileLoadFailed(true)
        setError('Failed to load your profile. Refresh and try again before saving changes.')
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [router])

  useEffect(() => {
    loadPayoutWaitlistPreferences()
  }, [loadPayoutWaitlistPreferences])

  const stripeQueryParam = searchParams.get('stripe')
  useEffect(() => {
    if (stripeQueryParam === 'connected' || stripeQueryParam === 'refresh') {
      syncStripeConnectStatus()
    }
  }, [stripeQueryParam, syncStripeConnectStatus])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    if (profileLoadFailed) {
      setError('Profile data failed to load. Refresh the page before saving.')
      setSaving(false)
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('Not authenticated')
      setSaving(false)
      return
    }

    const profileData = {
      name: human.name || '',
      bio: human.bio || null,
      avatar_url: human.avatar_url || null,
      location: human.location || null,
      drive_radius_miles: human.drive_radius_miles ?? null,
      timezone: human.timezone || null,
      skills: human.skills || [],
      rate_min: human.rate_min || 0,
      rate_max: human.rate_max || 0,
      availability: human.availability || {},
      wallet_address: human.wallet_address || null,
      social_links: socialLinksFromProfile(human),
    }

    // Always check for existing profile by user_id (not relying on state's human.id)
    // This prevents creating duplicates if the initial load failed
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('humans')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)

    if (existingProfileError) {
      profileLog.error(
        'Failed to resolve existing profile before save',
        {},
        { message: existingProfileError.message, code: existingProfileError.code }
      )
      setError('Failed to validate your profile before saving')
      setSaving(false)
      return
    }

    let saveEndpoint = '/api/v1/humans'
    let method: 'POST' | 'PATCH' = 'POST'
    if (existingProfile && existingProfile.length > 0) {
      saveEndpoint = `/api/v1/humans/${existingProfile[0].id}`
      method = 'PATCH'
    }

    const response = await fetch(saveEndpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profileData),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.success) {
      setError(toApiError(payload))
    } else {
      if (payload?.data) {
        setHuman(payload.data)
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      setError(uploadError.message)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName)

    setHuman((prev) => ({ ...prev, avatar_url: publicUrl }))
  }

  async function updatePayoutWaitlistPreference(provider: 'paypal' | 'venmo', joinWaitlist: boolean) {
    setUpdatingWaitlistProvider(provider)
    setError(null)

    try {
      const response = await fetch('/api/v1/humans/me/payout-preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          [`${provider}_waitlist`]: joinWaitlist,
        }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        setError(payload?.error || 'Failed to update payout waitlist')
        return
      }

      setPayoutWaitlistPreferences({
        paypal_waitlist: Boolean(payload.data?.paypal_waitlist),
        venmo_waitlist: Boolean(payload.data?.venmo_waitlist),
      })
    } catch {
      setError('Failed to update payout waitlist')
    } finally {
      setUpdatingWaitlistProvider(null)
    }
  }

  async function handleStripeConnect(action: 'setup' | 'manage') {
    setConnectingStripe(true)
    setError(null)
    setStripeConnectError(null)
    setStripeRedirectUrl(null)

    try {
      const response = await fetch('/api/v1/humans/me/stripe-connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        const message = payload?.error || 'Failed to open Stripe payout setup'
        setError(message)
        setStripeConnectError(message)
        return
      }

      const redirectUrl = payload.data?.redirect_url || payload.data?.onboarding_url
      if (!redirectUrl || typeof redirectUrl !== 'string') {
        const message = 'Stripe redirect URL is missing'
        setError(message)
        setStripeConnectError(message)
        return
      }

      setStripeRedirectUrl(redirectUrl)
      window.location.assign(redirectUrl)
    } catch {
      const message = 'Failed to open Stripe payout setup'
      setError(message)
      setStripeConnectError(message)
    } finally {
      setConnectingStripe(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Your Profile</h1>
          <QualityScoreBadge
            label="HLS"
            score={human.human_legitimacy_score}
            confidence={human.human_legitimacy_confidence}
          />
        </div>
        <p className="text-muted-foreground">
          Set up your profile to start receiving bookings from AI agents
        </p>
        <QualityFormulaLinks className="mt-2" />
      </div>

      {/* Profile Completeness Indicator */}
      {(() => {
        const { percentage, missing } = getProfileCompleteness(human)
        return (
          <div className="bg-card border border-border rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Profile Completeness</h2>
              <span className={`text-2xl font-bold ${percentage === 100 ? 'text-green-500' : 'text-primary'}`}>
                {percentage}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mb-4">
              <div
                className={`h-2 rounded-full transition-all ${percentage === 100 ? 'bg-green-500' : 'bg-primary'}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {PROFILE_FIELDS.map((field) => {
                const isComplete = field.check(human)
                return (
                  <div
                    key={field.name}
                    className={`flex items-center gap-2 text-sm ${isComplete ? 'text-green-500' : 'text-muted-foreground'}`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                    {field.label}
                    {field.required && !isComplete && (
                      <span className="text-xs text-destructive">*</span>
                    )}
                  </div>
                )
              })}
            </div>
            {missing.length > 0 && (
              <p className="text-xs text-muted-foreground mt-4">
                * Required fields missing: {missing.join(', ')}
              </p>
            )}
          </div>
        )
      })()}

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 text-green-500 p-4 rounded-lg">
            Profile saved successfully!
          </div>
        )}

        {/* Avatar & Basic Info */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4">Basic Information</h2>

          <div className="flex items-start gap-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                {human.avatar_url ? (
                  <img
                    src={human.avatar_url}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-bold text-primary">
                    {human.name?.[0]?.toUpperCase() || '?'}
                  </span>
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors">
                <Upload className="w-4 h-4 text-primary-foreground" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </label>
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Full Name</label>
                <input
                  type="text"
                  value={human.name || ''}
                  onChange={(e) => setHuman((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Bio</label>
                <textarea
                  value={human.bio || ''}
                  onChange={(e) => setHuman((prev) => ({ ...prev, bio: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px]"
                  placeholder="Tell AI agents about yourself and your capabilities..."
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium mb-2">Location</label>
                  <input
                    type="text"
                    value={human.location || ''}
                    onChange={(e) => setHuman((prev) => ({ ...prev, location: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="San Francisco, CA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Drive Radius (miles)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={human.drive_radius_miles ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      const parsed = raw === '' ? null : Math.max(0, Number.parseInt(raw, 10) || 0)
                      setHuman((prev) => ({ ...prev, drive_radius_miles: parsed }))
                    }}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="25"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Timezone</label>
                  <select
                    value={human.timezone || ''}
                    onChange={(e) => setHuman((prev) => ({ ...prev, timezone: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select timezone</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="Europe/London">GMT</option>
                    <option value="Europe/Paris">Central European (CET)</option>
                    <option value="Asia/Tokyo">Japan (JST)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Skills */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4">Portfolio and Social Links</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Add public links that help agents and buyers verify your identity and prior work.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Website</label>
              <input
                type="url"
                value={human.website_url || ''}
                onChange={(e) => setLegacySocialLink('website_url', 'website', e.target.value)}
                placeholder="https://your-site.com"
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">GitHub</label>
              <input
                type="url"
                value={human.github_url || ''}
                onChange={(e) => setLegacySocialLink('github_url', 'github', e.target.value)}
                placeholder="https://github.com/your-handle"
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">LinkedIn</label>
              <input
                type="url"
                value={human.linkedin_url || ''}
                onChange={(e) => setLegacySocialLink('linkedin_url', 'linkedin', e.target.value)}
                placeholder="https://www.linkedin.com/in/your-name"
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Instagram</label>
              <input
                type="url"
                value={human.instagram_url || ''}
                onChange={(e) => setLegacySocialLink('instagram_url', 'instagram', e.target.value)}
                placeholder="https://www.instagram.com/your-handle"
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">YouTube</label>
              <input
                type="url"
                value={human.youtube_url || ''}
                onChange={(e) => setLegacySocialLink('youtube_url', 'youtube', e.target.value)}
                placeholder="https://www.youtube.com/@your-channel"
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">X</label>
              <input
                type="url"
                value={socialLinks.x || ''}
                onChange={(e) => setExtendedSocialLink('x', e.target.value)}
                placeholder="https://x.com/your-handle"
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Website 2</label>
              <input
                type="url"
                value={socialLinks.website_2 || ''}
                onChange={(e) => setExtendedSocialLink('website_2', e.target.value)}
                placeholder="https://second-site.com"
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Website 3</label>
              <input
                type="url"
                value={socialLinks.website_3 || ''}
                onChange={(e) => setExtendedSocialLink('website_3', e.target.value)}
                placeholder="https://third-site.com"
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Public contact email (stored, hidden)</label>
              <input
                type="email"
                value={socialLinks.contact_email || ''}
                onChange={(e) => setExtendedSocialLink('contact_email', e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Stored on your profile record for future use, not shown publicly right now.
              </p>
            </div>
          </div>
        </div>

        {/* Skills */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4">Skills</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Add skills that describe what you can do. AI agents will search for humans by skill.
          </p>
          <SkillsInput
            value={human.skills || []}
            onChange={(skills) => setHuman((prev) => ({ ...prev, skills }))}
          />
        </div>

        {/* Rate Range */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4">Hourly Rate Range</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Set your minimum and maximum hourly rate in USD
          </p>
          <RateRangeSlider
            value={[human.rate_min || 2500, human.rate_max || 10000]}
            onChange={([min, max]) => setHuman((prev) => ({ ...prev, rate_min: min, rate_max: max }))}
          />
        </div>

        {/* Availability */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4">Weekly Availability</h2>
          <AvailabilityScheduler
            value={(human.availability as AvailabilitySchedule) || {}}
            onChange={(availability) => setHuman((prev) => ({ ...prev, availability: availability as unknown as Human['availability'] }))}
          />
        </div>

        {/* Payment */}
        <div id="payment-methods" className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4">Payment Methods</h2>

          <div className="space-y-4">
            {/* Stripe Connect */}
            <div className="p-4 border border-border rounded-lg">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">Bank Account (Stripe)</h3>
                    <button
                      type="button"
                      onClick={() => setShowBankPayoutHelp((prev) => !prev)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="How bank payouts work"
                    >
                      <CircleHelp className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {syncingStripeStatus
                      ? 'Syncing Stripe status...'
                      : human.stripe_onboarding_complete
                        ? 'Connected. Bank payouts are ready.'
                        : 'Set up your bank account to receive payouts.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleStripeConnect(human.stripe_onboarding_complete ? 'manage' : 'setup')}
                  disabled={connectingStripe}
                  className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors"
                >
                  {connectingStripe ? 'Opening...' : human.stripe_onboarding_complete ? 'Manage payouts' : 'Set up bank account'}
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
              {showBankPayoutHelp && (
                <div className="mt-3 p-3 bg-muted/40 border border-border rounded-md text-sm">
                  <p className="font-medium mb-2">How bank payouts work</p>
                  <p className="text-muted-foreground">1. Click Set up bank account.</p>
                  <p className="text-muted-foreground">2. Complete the secure Stripe flow.</p>
                  <p className="text-muted-foreground">3. Once verified, completed bookings pay out to your bank account.</p>
                </div>
              )}
              {stripeConnectError && (
                <p className="mt-3 text-sm text-destructive">
                  {stripeConnectError}
                </p>
              )}
              {stripeRedirectUrl && (
                <a
                  href={stripeRedirectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  Open Stripe payout link
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {/* PayPal */}
            <div className="p-4 border border-border rounded-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">PayPal <span className="text-xs text-muted-foreground">(Coming soon)</span></h3>
                  <p className="text-sm text-muted-foreground">
                    Join the waitlist to get notified when PayPal payouts launch.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updatePayoutWaitlistPreference('paypal', !payoutWaitlistPreferences.paypal_waitlist)}
                  disabled={payoutWaitlistLoading || updatingWaitlistProvider === 'paypal'}
                  className="px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {updatingWaitlistProvider === 'paypal'
                    ? 'Saving...'
                    : payoutWaitlistPreferences.paypal_waitlist
                      ? 'Leave waitlist'
                      : 'Join waitlist'}
                </button>
              </div>
            </div>

            {/* Venmo */}
            <div className="p-4 border border-border rounded-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">Venmo <span className="text-xs text-muted-foreground">(Coming soon)</span></h3>
                  <p className="text-sm text-muted-foreground">
                    Join the waitlist to get notified when Venmo payouts launch.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updatePayoutWaitlistPreference('venmo', !payoutWaitlistPreferences.venmo_waitlist)}
                  disabled={payoutWaitlistLoading || updatingWaitlistProvider === 'venmo'}
                  className="px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {updatingWaitlistProvider === 'venmo'
                    ? 'Saving...'
                    : payoutWaitlistPreferences.venmo_waitlist
                      ? 'Leave waitlist'
                      : 'Join waitlist'}
                </button>
              </div>
            </div>

            {/* Crypto */}
            <div className="p-4 border border-border rounded-lg">
              <h3 className="font-medium mb-2">Crypto Wallet (Optional)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Receive payments in USDC on Base L2
              </p>
              <input
                type="text"
                value={human.wallet_address || ''}
                onChange={(e) => setHuman((prev) => ({ ...prev, wallet_address: e.target.value }))}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  )
}
