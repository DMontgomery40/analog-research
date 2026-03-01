'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Clock,
  User,
  FileText,
  CheckCircle,
  AlertCircle,
  Upload,
  Loader2,
  MessageSquare,
  CreditCard,
  Star,
  X,
  Paperclip,
  Camera,
  ExternalLink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calculateHumanPayoutCents, calculatePlatformFeeCents } from '@/lib/payments/pricing'
import { formatResearchAgentDisplayName } from '@/lib/molty-display'
import { logger } from '@/lib/logger'

interface Review {
  id: string
  rating: number
  comment: string | null
  reviewer_type: 'human' | 'agent'
  created_at: string
}

interface Booking {
  id: string
  title: string
  description: string
  status: string
  escrow_status: string
  amount: number
  platform_fee: number
  payer_amount: number
  processor_fee: number
  payment_method: 'stripe' | 'crypto' | null
  human_id: string
  agent_id: string
  estimated_hours: number | null
  actual_hours: number | null
  scheduled_start: string | null
  created_at: string
  completed_at: string | null
  stripe_payment_intent_id: string | null
  agents: { id: string; name: string } | null
  humans: { id: string; name: string; avatar_url: string | null; stripe_onboarding_complete: boolean } | null
  proofs: Proof[]
  bounties: { id: string; title: string } | null
  reviews?: Review[]
  permissions?: {
    can_submit_proof?: boolean
    can_review_proof?: boolean
  }
}

interface Proof {
  id: string
  description: string
  hours_worked: number
  status: string
  attachments: { name: string; url?: string; path?: string; type: string }[]
  feedback: string | null
  created_at: string
  reviewed_at: string | null
}

interface ExternalJobSummary {
  id: string
  status: string
  provider: string
  provider_env: string
  title: string | null
  address: string
  created_at: string
}

const bookingDetailLog = logger.withContext('app/(dashboard)/dashboard/bookings/[id]/page.tsx', 'BookingDetailPage')

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  funded: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  in_progress: 'bg-primary/10 text-primary border-primary/20',
  submitted: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
  disputed: 'bg-red-500/10 text-red-500 border-red-500/20',
  cancelled: 'bg-muted text-muted-foreground border-muted',
}

const escrowStatusColors: Record<string, string> = {
  pending: 'text-yellow-500',
  funded: 'text-blue-500',
  released: 'text-green-500',
  refunded: 'text-orange-500',
  disputed: 'text-red-500',
}

export default function BookingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const bookingId = params.id as string

  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [proofDescription, setProofDescription] = useState('')
  const [hoursWorked, setHoursWorked] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [humanId, setHumanId] = useState<string | null>(null)
  const [connectingStripe, setConnectingStripe] = useState(false)
  const [stripeConnectError, setStripeConnectError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [linkedFieldChecks, setLinkedFieldChecks] = useState<ExternalJobSummary[]>([])
  const [linkedFieldChecksLoading, setLinkedFieldChecksLoading] = useState(false)
  const [linkedFieldChecksError, setLinkedFieldChecksError] = useState<string | null>(null)
  const [reviewingProofId, setReviewingProofId] = useState<string | null>(null)
  const [proofReviewError, setProofReviewError] = useState<string | null>(null)
  const [proofReviewFeedback, setProofReviewFeedback] = useState<Record<string, string>>({})

  // Review form state
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewSuccess, setReviewSuccess] = useState(false)

  const fetchLinkedFieldChecks = useCallback(async (targetBookingId: string) => {
    setLinkedFieldChecksLoading(true)
    setLinkedFieldChecksError(null)

    try {
      const response = await fetch(`/api/v1/external-jobs?kind=field_check&booking_id=${encodeURIComponent(targetBookingId)}&limit=20&offset=0`)
      const result = await response.json()
      if (!response.ok || !result.success) {
        setLinkedFieldChecksError(result.error || 'Failed to load linked field checks')
        return
      }

      setLinkedFieldChecks((result.data || []) as ExternalJobSummary[])
    } catch {
      setLinkedFieldChecksError('Failed to load linked field checks')
    } finally {
      setLinkedFieldChecksLoading(false)
    }
  }, [])

  const fetchBooking = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: humanResult } = await supabase
        .from('humans')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (humanResult) {
        setHumanId(humanResult.id)
      }

      const response = await fetch(`/api/v1/bookings/${bookingId}`)
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success || !result.data) {
        const message = typeof result?.error === 'string'
          ? result.error
          : 'Failed to fetch booking'
        throw new Error(message)
      }

      const data = result.data as Booking
      setBooking(data)
      await fetchLinkedFieldChecks(bookingId)

      // Look up conversation for "Message Agent" link
      if (humanResult && data.agent_id) {
        const { data: convData } = await supabase
          .from('conversations')
          .select('id')
          .eq('human_id', humanResult.id)
          .eq('agent_id', data.agent_id)
          .maybeSingle()
        if (convData) {
          setConversationId(convData.id)
        }
      }
    } catch (err) {
      bookingDetailLog.error(
        'Error fetching booking detail',
        { bookingId },
        err instanceof Error ? { message: err.message } : { message: String(err) }
      )
      setError(err instanceof Error ? err.message : 'Failed to load booking')
    } finally {
      setLoading(false)
    }
  }, [bookingId, fetchLinkedFieldChecks, router])

  useEffect(() => {
    fetchBooking()
  }, [fetchBooking])

  const handleStripeConnect = async () => {
    setConnectingStripe(true)
    setStripeConnectError(null)

    try {
      const response = await fetch('/api/v1/humans/me/stripe-connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'setup' }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        setStripeConnectError(payload?.error || 'Failed to open Stripe payout setup')
        return
      }

      const redirectUrl = payload.data?.redirect_url || payload.data?.onboarding_url
      if (!redirectUrl || typeof redirectUrl !== 'string') {
        setStripeConnectError('Stripe redirect URL is missing')
        return
      }

      window.location.assign(redirectUrl)
    } catch {
      setStripeConnectError('Failed to open Stripe payout setup')
    } finally {
      setConnectingStripe(false)
    }
  }

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!proofDescription || !hoursWorked) return

    setSubmitting(true)
    setUploading(selectedFiles.length > 0)
    setError(null)

    try {
      const supabase = createClient()
      const attachments: { name: string; path: string; type: string }[] = []

      // Upload files to storage
      if (selectedFiles.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')

        for (const file of selectedFiles) {
          const fileExt = file.name.split('.').pop()
          const fileName = `${bookingId}/${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

          const { error: uploadError } = await supabase.storage
            .from('proof-attachments')
            .upload(fileName, file)

          if (uploadError) {
            throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`)
          }

          attachments.push({
            name: file.name,
            path: fileName,
            type: file.type || 'application/octet-stream',
          })
        }
      }

      setUploading(false)

      const response = await fetch(`/api/v1/bookings/${bookingId}/proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: proofDescription,
          hours_worked: parseFloat(hoursWorked),
          attachments,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit proof')
      }

      setProofDescription('')
      setHoursWorked('')
      setSelectedFiles([])
      await fetchBooking()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit proof')
    } finally {
      setSubmitting(false)
      setUploading(false)
    }
  }

  const handleReviewProof = async (proofId: string, approved: boolean) => {
    setReviewingProofId(proofId)
    setProofReviewError(null)

    try {
      const feedback = (proofReviewFeedback[proofId] || '').trim()
      const response = await fetch(`/api/v1/bookings/${bookingId}/proof/${proofId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved,
          feedback: feedback || undefined,
        }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to review proof')
      }

      await fetchBooking()
    } catch (err) {
      setProofReviewError(err instanceof Error ? err.message : 'Failed to review proof')
    } finally {
      setReviewingProofId(null)
    }
  }

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reviewRating) return

    setReviewSubmitting(true)
    setReviewError(null)

    try {
      const response = await fetch('/api/v1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          rating: reviewRating,
          comment: reviewComment || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit review')
      }

      setReviewSuccess(true)
      setReviewComment('')
      await fetchBooking()
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Failed to submit review')
    } finally {
      setReviewSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Booking Not Found</h2>
          <p className="text-muted-foreground mb-6">{error || 'This booking does not exist or you do not have access to it.'}</p>
          <Link
            href="/dashboard/bookings"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Bookings
          </Link>
        </div>
      </div>
    )
  }

  const platformFee = calculatePlatformFeeCents(booking.amount)
  const humanPayout = calculateHumanPayoutCents(booking.amount)
  const canSubmitProof = ['funded', 'in_progress'].includes(booking.status)
    && (
      booking.permissions?.can_submit_proof
      ?? booking.human_id === humanId
    )
  const canReviewProof = booking.permissions?.can_review_proof ?? false
  const viewerIsHuman = Boolean(humanId && booking.human_id === humanId)
  const stripePayoutReady = Boolean(booking.humans?.stripe_onboarding_complete)
  const needsStripePayoutSetup = booking.payment_method !== 'crypto' && !stripePayoutReady

  // Check if human has already reviewed this booking
  const humanReview = booking.reviews?.find(r => r.reviewer_type === 'human')
  const agentReview = booking.reviews?.find(r => r.reviewer_type === 'agent')
  const canLeaveReview = booking.status === 'completed' && booking.human_id === humanId && !humanReview

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/bookings"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Bookings
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-2">{booking.title}</h1>
            <p className="text-muted-foreground">
              by {formatResearchAgentDisplayName(booking.agents?.name) || 'Unknown ResearchAgent'}
            </p>
          </div>
          <span className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize border ${statusColors[booking.status]}`}>
            {booking.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="grid gap-6">
        {/* Description */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Description
          </h2>
          <p className="text-muted-foreground whitespace-pre-wrap">{booking.description}</p>

          {booking.bounties && (
            <div className="mt-4 pt-4 border-t border-border">
              <span className="text-sm text-muted-foreground">From bounty: </span>
              <Link href={`/dashboard/bounties/${booking.bounties.id}`} className="text-primary hover:underline">
                {booking.bounties.title}
              </Link>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Linked Field Checks
          </h2>

          <div className="mb-4 p-3 bg-muted/50 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Keep external evidence attached to the booking so payout and review context stays complete.
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={booking.bounties ? `/dashboard/bounties/${booking.bounties.id}#linked-field-checks` : '/dashboard/field-checks'}
                className="inline-flex items-center justify-center px-3 py-1.5 border border-border rounded-md text-sm font-medium hover:bg-accent transition-colors"
              >
                {booking.bounties ? 'Order from Bounty' : 'Order Field Check'}
              </Link>
              <Link
                href="/dashboard/field-checks"
                className="inline-flex items-center justify-center px-3 py-1.5 border border-border rounded-md text-sm font-medium hover:bg-accent transition-colors"
              >
                View All
              </Link>
            </div>
          </div>

          {linkedFieldChecksError && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {linkedFieldChecksError}
            </div>
          )}

          {linkedFieldChecksLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : linkedFieldChecks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No field checks linked to this booking.</p>
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

        {/* Payment & Escrow */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Payment & Escrow
          </h2>

          {booking.escrow_status === 'funded' && needsStripePayoutSetup && (
            <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-yellow-600">Payout setup required</p>
                <p className="text-sm text-muted-foreground">
                  This booking pays out via bank transfer. Set up Stripe payouts before the agent can release escrow.
                </p>
                {stripeConnectError && (
                  <p className="mt-2 text-sm text-destructive">{stripeConnectError}</p>
                )}
              </div>
              {viewerIsHuman ? (
                <button
                  type="button"
                  onClick={handleStripeConnect}
                  disabled={connectingStripe}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {connectingStripe ? 'Opening...' : 'Set up payouts'}
                  <ExternalLink className="w-4 h-4" />
                </button>
              ) : (
                <Link
                  href="/dashboard/profile#payment-methods"
                  className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors"
                >
                  View payout status
                </Link>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Subtotal</p>
              <p className="text-lg font-semibold">${(booking.amount / 100).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Platform Fee (3%)</p>
              <p className="text-lg font-semibold text-muted-foreground">${(platformFee / 100).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Your Payout</p>
              <p className="text-lg font-semibold text-green-500">${(humanPayout / 100).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Escrow Status</p>
              <p className={`text-lg font-semibold capitalize ${escrowStatusColors[booking.escrow_status]}`}>
                {booking.escrow_status}
              </p>
            </div>
          </div>

          {booking.processor_fee > 0 && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Processing fee (paid by payer)</p>
                <p className="text-lg font-semibold">${(booking.processor_fee / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Payer total</p>
                <p className="text-lg font-semibold">${(booking.payer_amount / 100).toFixed(2)}</p>
              </div>
            </div>
          )}

          {booking.status === 'pending' && booking.escrow_status === 'pending' && (
            <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm text-yellow-500">
                Waiting for agent to fund escrow. Work can begin once escrow is funded.
              </p>
            </div>
          )}

          {booking.escrow_status === 'funded' && booking.status !== 'completed' && (
            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-500">
                Escrow is funded! Funds will be released once work is approved.
              </p>
            </div>
          )}

          {booking.escrow_status === 'released' && (
            <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <p className="text-sm text-green-500">
                Payment released! ${(humanPayout / 100).toFixed(2)} has been transferred.
              </p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Timeline
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Created</p>
              <p className="font-medium">{new Date(booking.created_at).toLocaleDateString()}</p>
            </div>
            {booking.scheduled_start && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Scheduled Start</p>
                <p className="font-medium">{new Date(booking.scheduled_start).toLocaleDateString()}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground mb-1">Estimated Hours</p>
              <p className="font-medium">{booking.estimated_hours || '-'}</p>
            </div>
            {booking.completed_at && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Completed</p>
                <p className="font-medium">{new Date(booking.completed_at).toLocaleDateString()}</p>
              </div>
            )}
            {booking.actual_hours && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Actual Hours</p>
                <p className="font-medium">{booking.actual_hours}</p>
              </div>
            )}
          </div>
        </div>

        {/* Proof Submissions */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Proof Submissions
          </h2>

          {proofReviewError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
              {proofReviewError}
            </div>
          )}

          {booking.status === 'submitted' && !canReviewProof && (
            <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-600">
              Proof submitted, awaiting review by the bounty owner.
            </div>
          )}

          {booking.proofs && booking.proofs.length > 0 ? (
            <div className="space-y-4">
              {booking.proofs.map((proof) => (
                <div key={proof.id} className="border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        proof.status === 'approved' ? 'bg-green-500/10 text-green-500' :
                        proof.status === 'rejected' ? 'bg-red-500/10 text-red-500' :
                        'bg-yellow-500/10 text-yellow-500'
                      }`}>
                        {proof.status}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(proof.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {proof.hours_worked}h worked
                    </div>
                  </div>

                  <p className="text-sm whitespace-pre-wrap mb-3">{proof.description}</p>

                  {proof.attachments && proof.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {proof.attachments.map((attachment, i) => (
                        attachment.url ? (
                          <a
                            key={i}
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            {attachment.name}
                          </a>
                        ) : (
                          <span key={i} className="text-sm text-muted-foreground">
                            {attachment.name}
                          </span>
                        )
                      ))}
                    </div>
                  )}

                  {proof.feedback && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1">Agent feedback:</p>
                      <p className="text-sm">{proof.feedback}</p>
                    </div>
                  )}

                  {canReviewProof && proof.status === 'pending' && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      <label className="block text-sm">
                        <span className="block mb-1 text-muted-foreground">Review feedback (optional)</span>
                        <textarea
                          value={proofReviewFeedback[proof.id] || ''}
                          onChange={(event) => {
                            const value = event.target.value
                            setProofReviewFeedback((prev) => ({ ...prev, [proof.id]: value }))
                          }}
                          rows={3}
                          placeholder="Explain approval or request changes..."
                          className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleReviewProof(proof.id, true)}
                          disabled={reviewingProofId === proof.id}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          {reviewingProofId === proof.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          Approve proof
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewProof(proof.id, false)}
                          disabled={reviewingProofId === proof.id}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-500/10 text-red-500 text-sm font-medium hover:bg-red-500/20 disabled:opacity-50"
                        >
                          {reviewingProofId === proof.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                          Reject proof
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No proof submissions yet.</p>
          )}

          {/* Submit Proof Form */}
          {canSubmitProof && (
            <form onSubmit={handleSubmitProof} className="mt-6 pt-6 border-t border-border">
              <h3 className="font-medium mb-4">Submit Work Proof</h3>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Description of work completed</label>
                  <textarea
                    value={proofDescription}
                    onChange={(e) => setProofDescription(e.target.value)}
                    placeholder="Describe what you accomplished..."
                    rows={4}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Hours worked</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={hoursWorked}
                    onChange={(e) => setHoursWorked(e.target.value)}
                    placeholder="e.g., 2.5"
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Paperclip className="w-4 h-4 inline mr-1" />
                    Attachments (optional)
                  </label>
                  <div className="border border-dashed border-border rounded-lg p-4">
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || [])
                        setSelectedFiles(prev => [...prev, ...files])
                        e.target.value = '' // Reset to allow re-selecting same file
                      }}
                      className="hidden"
                      id="proof-files"
                      accept="image/*,.pdf,.doc,.docx,.txt,.zip"
                    />
                    <label
                      htmlFor="proof-files"
                      className="flex flex-col items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Upload className="w-8 h-8" />
                      <span className="text-sm">Click to upload files</span>
                      <span className="text-xs">Images, PDFs, documents, or archives</span>
                    </label>
                  </div>

                  {selectedFiles.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {selectedFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-2 px-3 py-2 bg-muted rounded-md text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                            <span className="truncate">{file.name}</span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                            className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {uploading ? 'Uploading files...' : 'Submitting...'}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Submit Proof
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Reviews Section */}
        {booking.status === 'completed' && (
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Star className="w-5 h-5" />
              Reviews
            </h2>

            {/* Existing Reviews */}
            {(humanReview || agentReview) && (
              <div className="space-y-4 mb-6">
                {humanReview && (
                  <div className="border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">Your Review</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${
                              star <= humanReview.rating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-muted-foreground'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    {humanReview.comment && (
                      <p className="text-sm text-muted-foreground">{humanReview.comment}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(humanReview.created_at).toLocaleDateString()}
                    </p>
                  </div>
                )}

                {agentReview && (
                  <div className="border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">Agent&apos;s Review of You</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${
                              star <= agentReview.rating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-muted-foreground'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    {agentReview.comment && (
                      <p className="text-sm text-muted-foreground">{agentReview.comment}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(agentReview.created_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Review Form */}
            {canLeaveReview && !reviewSuccess && (
              <form onSubmit={handleSubmitReview} className={humanReview || agentReview ? 'pt-6 border-t border-border' : ''}>
                <h3 className="font-medium mb-4">Leave a Review for {booking.agents?.name || 'the Agent'}</h3>

                {reviewError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
                    {reviewError}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Rating</label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          className="p-1 hover:scale-110 transition-transform"
                        >
                          <Star
                            className={`w-8 h-8 ${
                              star <= reviewRating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-muted-foreground hover:text-amber-400'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-2 text-sm text-muted-foreground">
                        {reviewRating} star{reviewRating !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Comment (optional)</label>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Share your experience working with this agent..."
                      rows={3}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={reviewSubmitting}
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium disabled:opacity-50"
                  >
                    {reviewSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Star className="w-4 h-4" />
                        Submit Review
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {reviewSuccess && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <p className="text-sm text-green-500">
                  Your review has been submitted successfully!
                </p>
              </div>
            )}

            {!canLeaveReview && !humanReview && !agentReview && (
              <p className="text-muted-foreground text-sm">No reviews yet.</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Link
            href={conversationId ? `/dashboard/conversations/${conversationId}` : `/dashboard/conversations`}
            className="inline-flex items-center gap-2 bg-card border border-border hover:border-primary/50 px-6 py-2 rounded-md font-medium transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Message Agent
          </Link>
        </div>
      </div>
    </div>
  )
}
