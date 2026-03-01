'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge, mapBookingStatus } from '@/components/admin/StatusBadge'
import { AuditTrail } from '@/components/admin/AuditTrail'
import { Button } from '@analoglabor/ui'
import {
  ArrowLeft,
  ShieldCheck,
  ShieldX,
  MapPin,
  Clock,
  DollarSign,
  Star,
  Briefcase,
  Loader2,
} from 'lucide-react'

interface Human {
  id: string
  user_id: string
  name: string
  bio: string | null
  avatar_url: string | null
  location: string | null
  drive_radius_miles?: number | null
  timezone: string | null
  skills: string[]
  rate_min: number
  rate_max: number
  is_verified: boolean
  verified_at: string | null
  total_earnings: number
  completed_bookings: number
  rating_average: number
  rating_count: number
  stripe_onboarding_complete: boolean
  wallet_address: string | null
  created_at: string
  updated_at: string
}

interface Booking {
  id: string
  title: string
  status: 'pending' | 'funded' | 'in_progress' | 'submitted' | 'completed' | 'disputed' | 'cancelled'
  amount: number
  currency: string
  created_at: string
}

interface Application {
  id: string
  status: string
  proposed_rate: number
  created_at: string
  bounties: { id: string; title: string } | null
}

interface AuditEntry {
  id: string
  action: string
  adminEmail: string
  createdAt: string
  beforeState?: Record<string, unknown> | null
  afterState?: Record<string, unknown> | null
  notes?: string | null
}

interface HumanDetailResponse {
  success: boolean
  data: {
    human: Human
    recentBookings: Booking[]
    recentApplications: Application[]
  }
  error?: string
}

interface AuditLogResponse {
  success: boolean
  data?: AuditEntry[]
  error?: string
}

export default function AdminHumanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [human, setHuman] = useState<Human | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isActioning, setIsActioning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      setError(null)

      try {
        const [humanRes, auditRes] = await Promise.all([
          fetch(`/api/v1/admin/humans/${id}`),
          fetch(`/api/v1/admin/moderation/events?content_type=admin.human.verify&limit=20`).catch(() => null),
        ])

        const humanData: HumanDetailResponse = await humanRes.json()
        if (!humanData.success) {
          setError(humanData.error || 'Failed to fetch human')
          setIsLoading(false)
          return
        }

        setHuman(humanData.data.human)
        setBookings(humanData.data.recentBookings)
        setApplications(humanData.data.recentApplications)

        // Parse audit log from moderation events
        if (auditRes) {
          const auditData: AuditLogResponse = await auditRes.json()
          if (auditData.success && auditData.data) {
            // Filter to only this human's events
            const filtered = auditData.data.filter((e) =>
              e.afterState && (e.afterState as Record<string, unknown>).id === id
            )
            setAuditLog(filtered)
          }
        }
      } catch {
        setError('Failed to fetch human')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [id])

  async function handleVerify() {
    if (!human || isActioning) return

    setIsActioning(true)
    try {
      const res = await fetch(`/api/v1/admin/humans/${id}/verify`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!data.success) {
        alert(data.error || 'Failed to verify')
        return
      }

      setHuman({ ...human, is_verified: true, verified_at: new Date().toISOString() })
    } catch {
      alert('Failed to verify')
    } finally {
      setIsActioning(false)
    }
  }

  async function handleUnverify() {
    if (!human || isActioning) return

    const reason = prompt('Reason for removing verification (optional):')
    if (reason === null) return // User cancelled

    setIsActioning(true)
    try {
      const res = await fetch(`/api/v1/admin/humans/${id}/unverify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()

      if (!data.success) {
        alert(data.error || 'Failed to unverify')
        return
      }

      setHuman({ ...human, is_verified: false, verified_at: null })
    } catch {
      alert('Failed to unverify')
    } finally {
      setIsActioning(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (error || !human) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error || 'Human not found'}
        </div>
        <Button variant="ghost" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go back
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link
            href="/admin/humans"
            className="p-2 hover:bg-accent rounded-md transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-4">
            {human.avatar_url ? (
              <img
                src={human.avatar_url}
                alt={human.name}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-2xl font-medium text-primary">
                  {human.name[0]?.toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">{human.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusBadge
                  status={human.is_verified ? 'verified' : 'unverified'}
                />
                {human.location && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    {human.location}
                  </span>
                )}
                {typeof human.drive_radius_miles === 'number' && (
                  <span className="text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
                    {human.drive_radius_miles === 0 ? 'Remote only' : `Within ${human.drive_radius_miles} mi`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {human.is_verified ? (
            <Button
              variant="destructive"
              onClick={handleUnverify}
              disabled={isActioning}
              className="min-h-[44px]"
            >
              {isActioning ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ShieldX className="w-4 h-4 mr-2" />
              )}
              Remove Verification
            </Button>
          ) : (
            <Button
              onClick={handleVerify}
              disabled={isActioning}
              className="min-h-[44px]"
            >
              {isActioning ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4 mr-2" />
              )}
              Verify Human
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Earnings</span>
          </div>
          <p className="text-xl font-semibold">${(human.total_earnings / 100).toFixed(2)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Briefcase className="w-4 h-4" />
            <span className="text-sm">Bookings</span>
          </div>
          <p className="text-xl font-semibold">{human.completed_bookings}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Star className="w-4 h-4" />
            <span className="text-sm">Rating</span>
          </div>
          <p className="text-xl font-semibold">
            {human.rating_count > 0 ? `${human.rating_average}/5` : 'N/A'}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Hourly Rate</span>
          </div>
          <p className="text-xl font-semibold">
            ${(human.rate_min / 100).toFixed(0)} - ${(human.rate_max / 100).toFixed(0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Details */}
        <div className="bg-card border border-border rounded-xl">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Profile Details</h2>
          </div>
          <div className="p-4 space-y-4">
            {human.bio && (
              <div>
                <span className="text-sm text-muted-foreground">Bio</span>
                <p className="mt-1">{human.bio}</p>
              </div>
            )}
            <div>
              <span className="text-sm text-muted-foreground">Skills</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {human.skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-1 text-sm bg-muted rounded"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
            {human.timezone && (
              <div>
                <span className="text-sm text-muted-foreground">Timezone</span>
                <p className="mt-1">{human.timezone}</p>
              </div>
            )}
            <div>
              <span className="text-sm text-muted-foreground">Payment Setup</span>
              <div className="mt-1 space-y-1">
                <p>
                  Stripe: {human.stripe_onboarding_complete ? (
                    <span className="text-green-600">Complete</span>
                  ) : (
                    <span className="text-amber-600">Incomplete</span>
                  )}
                </p>
                {human.wallet_address && (
                  <p className="text-sm font-mono truncate">
                    Wallet: {human.wallet_address}
                  </p>
                )}
              </div>
            </div>
            <div className="pt-2 border-t border-border text-sm text-muted-foreground">
              <p>Joined: {new Date(human.created_at).toLocaleDateString()}</p>
              {human.verified_at && (
                <p>Verified: {new Date(human.verified_at).toLocaleDateString()}</p>
              )}
            </div>
          </div>
        </div>

        {/* Recent Bookings */}
        <div className="bg-card border border-border rounded-xl">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Recent Bookings</h2>
          </div>
          <div className="p-4">
            {bookings.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No bookings yet</p>
            ) : (
              <div className="space-y-3">
                {bookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div>
                      <p className="font-medium">{booking.title}</p>
                      <p className="text-sm text-muted-foreground">
                        ${(booking.amount / 100).toFixed(2)} {booking.currency}
                      </p>
                    </div>
                    <StatusBadge status={mapBookingStatus(booking.status)} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Applications */}
        <div className="bg-card border border-border rounded-xl">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Recent Applications</h2>
          </div>
          <div className="p-4">
            {applications.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No applications yet</p>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div>
                      <p className="font-medium">{app.bounties?.title || 'Unknown bounty'}</p>
                      <p className="text-sm text-muted-foreground">
                        ${(app.proposed_rate / 100).toFixed(2)}/hr
                      </p>
                    </div>
                    <StatusBadge
                      status={app.status === 'accepted' ? 'success' : app.status === 'rejected' ? 'error' : 'pending'}
                      label={app.status}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Audit Trail */}
        <div className="bg-card border border-border rounded-xl">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Admin Actions</h2>
          </div>
          <div className="p-4">
            <AuditTrail
              entries={auditLog}
              emptyMessage="No admin actions recorded"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
