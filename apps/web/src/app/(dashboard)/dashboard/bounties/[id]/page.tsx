'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Clock, DollarSign, Users, Send, Check, X, MapPin, Star, ChevronDown, ChevronUp, Camera, Loader2, Globe } from 'lucide-react'
import { FieldCheckOrderForm } from '@/components/field-checks/FieldCheckOrderForm'
import { QualityFormulaLinks, QualityScoreBadge } from '@/components/quality-score-badge'
import { useToast } from '@analogresearch/ui'
import { formatResearchAgentDisplayName } from '@/lib/researchagent-display'
import { formatPaymentRailLabel } from '@/lib/payment-rail'

interface CapacityData {
  bounty_id: string
  status: string
  spots_available: number
  spots_filled: number
  spots_remaining: number
  is_full: boolean
}

interface ApplicationHuman {
  id: string
  name: string
  avatar_url: string | null
  bio: string | null
  skills: string[]
  rating_average: number
  location: string | null
  human_legitimacy_score?: number | null
  human_legitimacy_confidence?: number | null
}

interface ApplicationWithDetails {
  id: string
  human_id: string
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn'
  proposed_rate: number
  estimated_hours: number | null
  cover_letter: string | null
  created_at: string
  humans: ApplicationHuman
  booking: {
    id: string
    status: string
    escrow_status: string
    payment_method: 'stripe' | 'crypto' | null
  } | null
}

interface BountyWithDetails {
  id: string
  title: string
  description: string
  skills_required: string[]
  budget_min: number
  budget_max: number
  currency: string
  pricing_mode: 'bid' | 'fixed_per_spot'
  fixed_spot_amount: number | null
  preferred_payment_method: 'stripe' | 'crypto' | null
  proof_review_mode: 'manual' | 'llm_assisted'
  spots_available: number
  spots_filled: number
  bounty_legitimacy_score?: number | null
  bounty_legitimacy_confidence?: number | null
  deadline: string | null
  status: string
  application_count: number
  agent_id: string
  agents: { name: string; rating_average: number; owner_human_id?: string | null }
  applications: ApplicationWithDetails[]
}

interface MyApplicationWithBooking {
  id: string
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn'
  booking: {
    id: string
    status: string
    escrow_status: string
    payment_method: 'stripe' | 'crypto' | null
  } | null
}

interface ExternalJobSummary {
  id: string
  provider: string
  provider_env: string
  status: string
  address: string
  title: string | null
  created_at: string
}

function ApplicationCard({
  application,
  currency,
  pricingMode,
  isProcessing,
  onAccept,
  onReject,
  onFundEscrow,
}: {
  application: ApplicationWithDetails
  currency: string
  pricingMode: 'bid' | 'fixed_per_spot'
  isProcessing: boolean
  onAccept: () => void
  onReject: () => void
  onFundEscrow: (paymentMethod: 'stripe' | 'crypto') => void
}) {
  const [expanded, setExpanded] = useState(false)
  const human = application.humans

  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-600',
    accepted: 'bg-green-500/10 text-green-500',
    rejected: 'bg-red-500/10 text-red-500',
    withdrawn: 'bg-muted text-muted-foreground',
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {human.avatar_url ? (
            <img
              src={human.avatar_url}
              alt={human.name}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="font-bold text-primary text-lg">
                {human.name?.[0] || 'H'}
              </span>
            </div>
          )}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{human.name}</h3>
                <QualityScoreBadge
                  label="HLS"
                  score={human.human_legitimacy_score}
                  confidence={human.human_legitimacy_confidence}
                />
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                {human.rating_average > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                    {human.rating_average.toFixed(1)}
                  </span>
                )}
                {human.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {human.location}
                  </span>
                )}
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[application.status]}`}>
              {application.status}
            </span>
          </div>

          {/* Rate and hours */}
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span>
              <span className="text-muted-foreground">Rate:</span>{' '}
              <span className="font-medium">
                {currency} {(application.proposed_rate / 100).toFixed(2)}
                {pricingMode === 'bid' && ' (bid)'}
              </span>
            </span>
            {application.estimated_hours && (
              <span>
                <span className="text-muted-foreground">Est:</span>{' '}
                <span className="font-medium">{application.estimated_hours}h</span>
              </span>
            )}
          </div>

          {/* Skills */}
          {human.skills && human.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {human.skills.slice(0, 4).map((skill) => (
                <span
                  key={skill}
                  className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs"
                >
                  {skill}
                </span>
              ))}
              {human.skills.length > 4 && (
                <span className="px-2 py-0.5 text-muted-foreground text-xs">
                  +{human.skills.length - 4} more
                </span>
              )}
            </div>
          )}

          {/* Cover letter toggle */}
          {application.cover_letter && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-sm text-primary mt-2 hover:underline"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Hide cover letter
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Show cover letter
                </>
              )}
            </button>
          )}

          {/* Expanded cover letter */}
          {expanded && application.cover_letter && (
            <div className="mt-2 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground whitespace-pre-wrap">
              {application.cover_letter}
            </div>
          )}

          {/* Action buttons for pending applications */}
          {application.status === 'pending' && (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={onAccept}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isProcessing ? 'Processing...' : 'Accept'}
              </button>
              <button
                onClick={onReject}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-500 rounded-md text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Reject
              </button>
            </div>
          )}

          {application.status === 'accepted' && application.booking && (
            <div className="mt-3 space-y-2">
              <div className="text-sm text-muted-foreground">
                Booking: <span className="font-medium text-foreground">{application.booking.status.replace('_', ' ')}</span>
                {' '}• Escrow:{' '}
                <span className="font-medium text-foreground">{application.booking.escrow_status.replace('_', ' ')}</span>
                {' '}• Payment:{' '}
                <span className="font-medium text-foreground">{application.booking.payment_method || 'not selected'}</span>
              </div>
              {application.booking.escrow_status === 'pending' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onFundEscrow('stripe')}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? 'Opening...' : 'Fund via Stripe'}
                  </button>
                  <button
                    onClick={() => onFundEscrow('crypto')}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? 'Opening...' : 'Fund via Coinbase'}
                  </button>
                </div>
              )}
              <Link
                href={`/dashboard/bookings/${application.booking.id}`}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                Open booking
              </Link>
            </div>
          )}

          {/* Applied date */}
          <div className="text-xs text-muted-foreground mt-2">
            Applied {new Date(application.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BountyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [bounty, setBounty] = useState<BountyWithDetails | null>(null)
  const [capacity, setCapacity] = useState<CapacityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [application, setApplication] = useState({
    cover_letter: '',
    proposed_rate: 0,
    estimated_hours: '',
  })
  const [hasApplied, setHasApplied] = useState(false)
  const [myApplication, setMyApplication] = useState<MyApplicationWithBooking | null>(null)
  const [humanId, setHumanId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [processingAppId, setProcessingAppId] = useState<string | null>(null)
  const [linkedFieldChecks, setLinkedFieldChecks] = useState<ExternalJobSummary[]>([])
  const [linkedFieldChecksLoading, setLinkedFieldChecksLoading] = useState(false)
  const [linkedFieldChecksError, setLinkedFieldChecksError] = useState<string | null>(null)
  const [linkedMatches, setLinkedMatches] = useState<Array<{
    id: string
    provider: string
    status: string
    created_at: string
    talent_connector_workers: { display_name: string | null } | null
  }>>([])
  const [linkedMatchesLoading, setLinkedMatchesLoading] = useState(false)

  async function loadOwnerApplications(bountyId: string) {
    try {
      const response = await fetch(`/api/v1/bounties/${bountyId}/applications/manage`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        return
      }

      const payload = await response.json()
      if (payload.success) {
        const ownerApplications = (payload.data || []) as ApplicationWithDetails[]
        setBounty((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            applications: ownerApplications,
          }
        })
      }
    } catch {
      // Best effort owner-side fetch.
    }
  }

  async function loadMyApplicationStatus(bountyId: string) {
    try {
      const response = await fetch(`/api/v1/bounties/${bountyId}/my-application`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        return
      }

      const payload = await response.json()
      if (payload.success) {
        const data = payload.data as MyApplicationWithBooking | null
        setMyApplication(data)
        setHasApplied(Boolean(data))
      }
    } catch {
      // Best effort for sidebar state.
    }
  }

  async function loadLinkedFieldChecks(bountyId: string) {
    setLinkedFieldChecksLoading(true)
    setLinkedFieldChecksError(null)

    try {
      const response = await fetch(`/api/v1/external-jobs?kind=field_check&bounty_id=${encodeURIComponent(bountyId)}&limit=20&offset=0`, {
        cache: 'no-store',
      })
      const payload = await response.json()

      if (!response.ok || !payload.success) {
        setLinkedFieldChecksError(payload.error || 'Failed to load linked field checks')
        return
      }

      setLinkedFieldChecks((payload.data || []) as ExternalJobSummary[])
    } catch {
      setLinkedFieldChecksError('Failed to load linked field checks')
    } finally {
      setLinkedFieldChecksLoading(false)
    }
  }

  async function loadLinkedMatches(bountyId: string) {
    setLinkedMatchesLoading(true)
    try {
      const response = await fetch(`/api/v1/talent-connectors/matches?bounty_id=${encodeURIComponent(bountyId)}&limit=20`, {
        cache: 'no-store',
      })
      const payload = await response.json()
      if (response.ok && payload.success) {
        setLinkedMatches(payload.data || [])
      }
    } catch {
      // Silently fail — talent connectors may not be enabled
    } finally {
      setLinkedMatchesLoading(false)
    }
  }

  useEffect(() => {
    async function loadBounty() {
      const supabase = createClient()
      let currentHumanId: string | null = null
      let currentOwnerAgentId: string | null = null

      // Get user's human profile
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data: humanData } = await supabase
          .from('humans')
          .select('id')
          .eq('user_id', user.id)
          .single()
        const human = humanData as { id: string } | null
        if (human) {
          currentHumanId = human.id
          setHumanId(human.id)

          const { data: ownerAgentByFk } = await supabase
            .from('agents')
            .select('id')
            .eq('owner_human_id', human.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()

          if (ownerAgentByFk?.id) {
            currentOwnerAgentId = ownerAgentByFk.id
          } else {
            const { data: ownerAgentLegacy } = await supabase
              .from('agents')
              .select('id')
              .eq('name', `human_${human.id}`)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle()

            if (ownerAgentLegacy?.id) {
              currentOwnerAgentId = ownerAgentLegacy.id
            }
          }
        }
      }

      const bountyId = params.id as string
      const { data } = await supabase
        .from('bounties')
        .select(`
          id,
          title,
          description,
          skills_required,
          budget_min,
          budget_max,
          currency,
          pricing_mode,
          fixed_spot_amount,
          preferred_payment_method,
          proof_review_mode,
          spots_available,
          spots_filled,
          bounty_legitimacy_score,
          bounty_legitimacy_confidence,
          deadline,
          status,
          application_count,
          agent_id,
          agents(name, rating_average, owner_human_id)
        `)
        .eq('id', bountyId)
        .single()

      if (data) {
        const bountyData = data as unknown as Omit<BountyWithDetails, 'applications'>
        setBounty({
          ...bountyData,
          applications: [],
        })

        const isCurrentUserOwner = Boolean(currentOwnerAgentId && bountyData.agent_id === currentOwnerAgentId)
        setIsOwner(isCurrentUserOwner)

        if (isCurrentUserOwner) {
          await loadOwnerApplications(bountyId)
          await loadLinkedFieldChecks(bountyId)
          loadLinkedMatches(bountyId)
        }

        const midpointRate = Math.round((bountyData.budget_min + bountyData.budget_max) / 2)
        const initialRate = bountyData.pricing_mode === 'fixed_per_spot'
          ? (bountyData.fixed_spot_amount || midpointRate)
          : midpointRate

        setApplication((prev) => ({
          ...prev,
          proposed_rate: initialRate,
        }))

        if (currentHumanId) {
          await loadMyApplicationStatus(bountyId)
        }
      }
      setLoading(false)
    }

    loadBounty()
  }, [params.id])

  useEffect(() => {
    let cancelled = false

    async function loadCapacity() {
      const bountyId = params.id as string
      if (!bountyId) {
        return
      }

      try {
        const response = await fetch(`/api/v1/bounties/${bountyId}/capacity`, { cache: 'no-store' })
        if (!response.ok) {
          return
        }

        const payload = await response.json()
        if (!cancelled && payload.success) {
          setCapacity(payload.data as CapacityData)
        }
      } catch {
        // Best effort polling.
      }
    }

    loadCapacity()
    const intervalId = setInterval(() => {
      // Only poll when tab is visible to save bandwidth
      if (!document.hidden) {
        loadCapacity()
      }
    }, 15000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [params.id])

  const spotsAvailable = capacity?.spots_available ?? bounty?.spots_available ?? 0
  const spotsFilled = capacity?.spots_filled ?? bounty?.spots_filled ?? 0
  const spotsRemaining = capacity?.spots_remaining ?? Math.max(spotsAvailable - spotsFilled, 0)
  const isFull = spotsRemaining <= 0

  async function handleApply(e: React.FormEvent) {
    e.preventDefault()

    if (!humanId) {
      router.push('/dashboard/profile')
      return
    }

    if (!bounty) {
      return
    }

    if (isFull) {
      toast({ title: 'Bounty full', description: 'All spots for this bounty are already filled.', variant: 'destructive' })
      return
    }

    setApplying(true)

    try {
      const bountyId = params.id as string

      // Refresh capacity right before submit to avoid stale page races.
      const capacityResponse = await fetch(`/api/v1/bounties/${bountyId}/capacity`, { cache: 'no-store' })
      if (capacityResponse.ok) {
        const capacityPayload = await capacityResponse.json()
        if (capacityPayload.success) {
          const latestCapacity = capacityPayload.data as CapacityData
          setCapacity(latestCapacity)
          if (latestCapacity.spots_remaining <= 0) {
            toast({ title: 'Bounty full', description: 'This bounty is now full.', variant: 'destructive' })
            return
          }
        }
      }

      const body: Record<string, unknown> = {
        cover_letter: application.cover_letter,
        estimated_hours: application.estimated_hours ? parseFloat(application.estimated_hours) : undefined,
        currency: bounty.currency,
      }

      if (bounty.pricing_mode === 'bid') {
        body.proposed_rate = application.proposed_rate
      }

      const response = await fetch(`/api/v1/bounties/${bountyId}/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        setHasApplied(true)
        await loadMyApplicationStatus(bountyId)
        toast({ title: 'Application submitted', description: 'Your application has been sent to the bounty owner.' })
      } else {
        const error = await response.json()
        toast({ title: 'Application failed', description: error.error || 'Failed to apply', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Application failed', description: 'Failed to apply', variant: 'destructive' })
    } finally {
      setApplying(false)
    }
  }

  async function handleManageApplication(applicationId: string, action: 'accept' | 'reject') {
    if (!bounty) return

    setProcessingAppId(applicationId)

    try {
      const response = await fetch(`/api/v1/bounties/${bounty.id}/applications/manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, action }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        await loadOwnerApplications(bounty.id)

        // Update capacity if we have it
        if (action === 'accept' && result.data?.capacity) {
          setCapacity(result.data.capacity)
        }
        toast({ title: action === 'accept' ? 'Application accepted' : 'Application rejected', description: action === 'accept' ? 'The applicant has been notified.' : 'The applicant has been notified of your decision.' })
      } else {
        toast({ title: 'Action failed', description: result.error || `Failed to ${action} application`, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Action failed', description: `Failed to ${action} application`, variant: 'destructive' })
    } finally {
      setProcessingAppId(null)
    }
  }

  async function handleFundEscrow(applicationId: string, bookingId: string, paymentMethod: 'stripe' | 'crypto') {
    if (!bookingId) {
      toast({ title: 'Error', description: 'Booking ID is missing for this application.', variant: 'destructive' })
      return
    }

    setProcessingAppId(applicationId)

    try {
      const response = await fetch(`/api/v1/bookings/${bookingId}/fund-escrow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_method: paymentMethod,
          return_url: window.location.href,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        toast({ title: 'Escrow funding failed', description: result.error || `Failed to fund escrow via ${paymentMethod}`, variant: 'destructive' })
        return
      }

      const redirectUrl = paymentMethod === 'crypto'
        ? result.data?.payment_link_url
        : result.data?.checkout_url

      if (!redirectUrl || typeof redirectUrl !== 'string') {
        toast({ title: 'Error', description: 'Payment URL missing in response.', variant: 'destructive' })
        return
      }

      window.location.assign(redirectUrl)
    } catch {
      toast({ title: 'Escrow funding failed', description: `Failed to fund escrow via ${paymentMethod}`, variant: 'destructive' })
    } finally {
      setProcessingAppId(null)
    }
  }

  // Sort applications: pending first, then accepted, then rejected
  const sortedApplications = bounty?.applications?.slice().sort((a, b) => {
    const order = { pending: 0, accepted: 1, rejected: 2, withdrawn: 3 }
    return (order[a.status] ?? 4) - (order[b.status] ?? 4)
  }) ?? []

  const pendingCount = sortedApplications.filter((a) => a.status === 'pending').length

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!bounty) {
    return (
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Bounty not found</h2>
          <Link href="/dashboard/browse" className="text-primary hover:underline">
            Back to browse
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href="/dashboard/browse"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to bounties
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold">{bounty.title}</h1>
                  <QualityScoreBadge
                    label="BLS"
                    score={bounty.bounty_legitimacy_score}
                    confidence={bounty.bounty_legitimacy_confidence}
                  />
                </div>
                <QualityFormulaLinks className="mt-1 text-xs" />
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                bounty.status === 'open' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
              }`}>
                {bounty.status}
              </span>
            </div>

            <p className="text-muted-foreground mb-6">{bounty.description}</p>

            <div className="flex flex-wrap gap-2 mb-6">
              {bounty.skills_required.map((skill) => (
                <span
                  key={skill}
                  className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-full text-sm"
                >
                  {skill}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border md:grid-cols-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Budget</div>
                  <div className="font-medium">
                    {bounty.currency} {(bounty.budget_min / 100).toFixed(0)} - {(bounty.budget_max / 100).toFixed(0)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Applications</div>
                  <div className="font-medium">{bounty.application_count}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Spots</div>
                  <div className="font-medium">{spotsFilled}/{spotsAvailable}</div>
                </div>
              </div>
              {bounty.deadline && (
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">Deadline</div>
                    <div className="font-medium">
                      {new Date(bounty.deadline).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-border text-sm text-muted-foreground space-y-1">
              <p>
                Payment rail:{' '}
                <span className="font-medium text-foreground">
                  {formatPaymentRailLabel(bounty.preferred_payment_method)}
                </span>
              </p>
              <p>
                Escrow funding model:{' '}
                <span className="font-medium text-foreground">deferred per booking (after acceptance)</span>
              </p>
              <p>
                Proof review mode:{' '}
                <span className="font-medium text-foreground">{bounty.proof_review_mode.replace('_', ' ')}</span>
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold mb-2">Posted by</h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="font-bold text-primary">
                  {formatResearchAgentDisplayName(bounty.agents?.name)[0] || 'R'}
                </span>
              </div>
              <div>
                <div className="font-medium">{formatResearchAgentDisplayName(bounty.agents?.name)}</div>
                {bounty.agents?.rating_average > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {bounty.agents.rating_average}/5 rating
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Applications Section - Only visible to bounty owner */}
          {isOwner && (
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Applications</h2>
                {pendingCount > 0 && (
                  <span className="px-2.5 py-0.5 bg-yellow-500/10 text-yellow-600 rounded-full text-sm font-medium">
                    {pendingCount} pending
                  </span>
                )}
              </div>

              {sortedApplications.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No applications yet
                </p>
              ) : (
                <div className="space-y-4">
                  {sortedApplications.map((app) => (
                    <ApplicationCard
                      key={app.id}
                      application={app}
                      currency={bounty.currency}
                      pricingMode={bounty.pricing_mode}
                      isProcessing={processingAppId === app.id}
                      onAccept={() => handleManageApplication(app.id, 'accept')}
                      onReject={() => handleManageApplication(app.id, 'reject')}
                      onFundEscrow={(paymentMethod) => handleFundEscrow(app.id, app.booking?.id || '', paymentMethod)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {isOwner && (
            <div id="linked-field-checks" className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Camera className="w-5 h-5 text-primary" />
                <h2 className="font-semibold">Linked Field Checks</h2>
              </div>

              {linkedFieldChecksError && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                  {linkedFieldChecksError}
                </div>
              )}

              <div className="mb-4">
                <FieldCheckOrderForm
                  linkedRecordIds={{ bounty_id: bounty.id }}
                  submitLabel="Order Linked Field Check"
                  addressPlaceholder="Address for drive-by check"
                  instructionsPlaceholder="What to verify and what photos are needed"
                  helperText="This request is automatically linked to this bounty for faster context tracking."
                  onCreated={async () => {
                    setLinkedFieldChecksError(null)
                    toast({
                      title: 'Field check ordered',
                      description: 'Linked field check created successfully.',
                    })
                    await loadLinkedFieldChecks(bounty.id)
                  }}
                  onError={(message) => {
                    if (!message) return
                    setLinkedFieldChecksError(message)
                    toast({
                      title: 'Field check failed',
                      description: message,
                      variant: 'destructive',
                    })
                  }}
                />
              </div>

              {linkedFieldChecksLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : linkedFieldChecks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No linked field checks yet.</p>
              ) : (
                <div className="space-y-2">
                  {linkedFieldChecks.map((job) => (
                    <Link
                      key={job.id}
                      href={`/dashboard/field-checks/${job.id}`}
                      className="block border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{job.title || job.address}</p>
                          <p className="text-xs text-muted-foreground truncate">{job.address}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {job.provider} ({job.provider_env}) · {job.status.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground shrink-0">
                          {new Date(job.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {isOwner && linkedMatches.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-5 h-5 text-purple-600" />
                <h2 className="font-semibold">Talent Connector Matches</h2>
              </div>

              {linkedMatchesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {linkedMatches.map((match) => (
                    <div
                      key={match.id}
                      className="border border-border rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {match.talent_connector_workers?.display_name || 'Worker'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {match.provider} · {match.status.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground shrink-0">
                          {new Date(match.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar - Application form */}
        <div>
          <div className="bg-card border border-border rounded-xl p-6 sticky top-6">
            <h2 className="font-semibold mb-1">
              {hasApplied ? 'Application Submitted' : 'Apply to this Bounty'}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Spots remaining: {spotsRemaining}
            </p>

            {hasApplied ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                  <Send className="w-6 h-6 text-green-500" />
                </div>
                <p className="text-muted-foreground">
                  {myApplication?.status === 'accepted'
                    ? 'Your application was accepted.'
                    : myApplication?.status === 'rejected'
                      ? 'Your application was not selected.'
                      : 'Your application has been submitted. The agent will review it shortly.'}
                </p>
                {myApplication?.booking && (
                  <Link
                    href={`/dashboard/bookings/${myApplication.booking.id}`}
                    className="inline-flex mt-3 text-sm text-primary hover:underline"
                  >
                    Open booking
                  </Link>
                )}
                {myApplication?.booking && myApplication.booking.status === 'submitted' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Proof submitted, awaiting review.
                  </p>
                )}
              </div>
            ) : bounty.status !== 'open' ? (
              <p className="text-muted-foreground text-center py-4">
                This bounty is no longer accepting applications.
              </p>
            ) : isFull ? (
              <p className="text-muted-foreground text-center py-4">
                This bounty has filled all available spots.
              </p>
            ) : !humanId ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-4">
                  Complete your profile to apply
                </p>
                <Link
                  href="/dashboard/profile"
                  className="inline-flex bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium"
                >
                  Set Up Profile
                </Link>
              </div>
            ) : (
              <form onSubmit={handleApply} className="space-y-4">
                {bounty.pricing_mode === 'fixed_per_spot' ? (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Fixed Amount Per Spot
                    </label>
                    <input
                      type="text"
                      value={`${bounty.currency} ${((bounty.fixed_spot_amount || 0) / 100).toFixed(2)}`}
                      className="w-full px-3 py-2 bg-muted border border-input rounded-md"
                      disabled
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      This bounty uses fixed pricing. Custom bids are disabled.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Proposed Rate ({bounty.currency}, in cents)
                    </label>
                    <input
                      type="number"
                      value={application.proposed_rate}
                      onChange={(e) => setApplication((prev) => ({
                        ...prev,
                        proposed_rate: parseInt(e.target.value, 10) || 0,
                      }))}
                      min={bounty.budget_min}
                      max={bounty.budget_max}
                      className="w-full px-3 py-2 bg-background border border-input rounded-md"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {bounty.currency} {(application.proposed_rate / 100).toFixed(2)}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Estimated Hours (optional)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={application.estimated_hours}
                    onChange={(e) => setApplication((prev) => ({
                      ...prev,
                      estimated_hours: e.target.value,
                    }))}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md"
                    placeholder="e.g., 4"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Cover Letter
                  </label>
                  <textarea
                    value={application.cover_letter}
                    onChange={(e) => setApplication((prev) => ({
                      ...prev,
                      cover_letter: e.target.value,
                    }))}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md min-h-[120px]"
                    placeholder="Why are you a good fit for this task?"
                  />
                </div>

                <button
                  type="submit"
                  disabled={applying || isFull}
                  className="w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {applying ? 'Submitting...' : 'Submit Application'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
