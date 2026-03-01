import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminOrRedirect } from '@/lib/admin/admin-auth'
import { AlertTriangle, Users, ShieldAlert, DollarSign, Briefcase, CreditCard, CircleDollarSign } from 'lucide-react'
import Link from 'next/link'
import { StatCard } from '@/components/admin/StatCard'
import { ActionCard } from '@/components/admin/ActionCard'
import { isPaymentsPaused } from '@/lib/payments/pause-config'

interface DashboardStats {
  openDisputes: number
  pendingVerifications: number
  flaggedBounties: number
  todayVolume: Record<string, number>
  totalHumans: number
  totalBookings: number
  activeBookings: number
}

async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createServiceClient()

  const [
    openDisputesResult,
    pendingVerificationsResult,
    flaggedBountiesResult,
    todayBookingsResult,
    totalHumansResult,
    totalBookingsResult,
    activeBookingsResult,
  ] = await Promise.all([
    supabase
      .from('disputes')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'under_review']),
    supabase
      .from('humans')
      .select('id', { count: 'exact', head: true })
      .eq('is_verified', false),
    supabase
      .from('bounties')
      .select('id', { count: 'exact', head: true })
      .eq('moderation_decision', 'fail'),
    supabase
      .from('bookings')
      .select('amount, currency')
      .eq('status', 'completed')
      .gte('completed_at', new Date().toISOString().split('T')[0]),
    supabase
      .from('humans')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'in_progress'),
  ])

  interface BookingAmount {
    amount: number
    currency: string
  }

  const volumeByCurrency: Record<string, number> = {}
  if (todayBookingsResult.data) {
    for (const booking of todayBookingsResult.data as BookingAmount[]) {
      const currency = booking.currency || 'USD'
      volumeByCurrency[currency] = (volumeByCurrency[currency] || 0) + booking.amount
    }
  }

  return {
    openDisputes: openDisputesResult.count || 0,
    pendingVerifications: pendingVerificationsResult.count || 0,
    flaggedBounties: flaggedBountiesResult.count || 0,
    todayVolume: volumeByCurrency,
    totalHumans: totalHumansResult.count || 0,
    totalBookings: totalBookingsResult.count || 0,
    activeBookings: activeBookingsResult.count || 0,
  }
}

interface ActionQueueItem {
  id: string
  type: 'verification' | 'dispute' | 'flagged'
  title: string
  subtitle: string
  href: string
  createdAt: string
}

async function getActionQueue(): Promise<ActionQueueItem[]> {
  const supabase = await createServiceClient()
  const items: ActionQueueItem[] = []

  // Unverified humans (up to 5)
  const { data: unverifiedHumans } = await supabase
    .from('humans')
    .select('id, name, created_at')
    .eq('is_verified', false)
    .order('created_at', { ascending: false })
    .limit(5)

  if (unverifiedHumans) {
    for (const human of unverifiedHumans) {
      items.push({
        id: human.id,
        type: 'verification',
        title: human.name,
        subtitle: 'Pending verification',
        href: `/admin/humans/${human.id}`,
        createdAt: human.created_at,
      })
    }
  }

  // Open disputes (up to 5)
  const { data: openDisputes } = await supabase
    .from('disputes')
    .select('id, reason, status, created_at, bookings(title)')
    .in('status', ['open', 'under_review'])
    .order('created_at', { ascending: false })
    .limit(5)

  interface DisputeRow {
    id: string
    reason: string
    status: string
    created_at: string
    bookings: { title: string }[] | { title: string } | null
  }

  if (openDisputes) {
    for (const dispute of openDisputes as DisputeRow[]) {
      const bookingTitle = Array.isArray(dispute.bookings)
        ? dispute.bookings[0]?.title
        : dispute.bookings?.title

      items.push({
        id: dispute.id,
        type: 'dispute',
        title: bookingTitle || 'Unknown booking',
        subtitle: dispute.reason.slice(0, 100) + (dispute.reason.length > 100 ? '...' : ''),
        href: `/admin/disputes/${dispute.id}`,
        createdAt: dispute.created_at,
      })
    }
  }

  // Flagged bounties (up to 5)
  const { data: flaggedBounties } = await supabase
    .from('bounties')
    .select('id, title, moderation_reason_codes, created_at')
    .eq('moderation_decision', 'fail')
    .order('created_at', { ascending: false })
    .limit(5)

  if (flaggedBounties) {
    for (const bounty of flaggedBounties) {
      items.push({
        id: bounty.id,
        type: 'flagged',
        title: bounty.title,
        subtitle: `Flagged: ${bounty.moderation_reason_codes.join(', ') || 'Unknown reason'}`,
        href: `/admin/bounties`,
        createdAt: bounty.created_at,
      })
    }
  }

  // Sort by created_at, newest first
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return items.slice(0, 10)
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export default async function AdminDashboardPage() {
  await requireAdminOrRedirect()

  const [stats, actionQueue, pauseStatus] = await Promise.all([
    getDashboardStats(),
    getActionQueue(),
    isPaymentsPaused(),
  ])

  const totalVolume = Object.entries(stats.todayVolume)
    .map(([currency, amount]) => formatCurrency(amount, currency))
    .join(' / ') || '$0'

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Platform overview and action queue</p>
      </div>

      {/* Payments status banner */}
      {pauseStatus.paused && (
        <Link
          href="/admin/payments/config"
          className="block rounded-xl border-2 border-red-500 bg-red-50 dark:bg-red-950/20 p-4 hover:bg-red-100 dark:hover:bg-red-950/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <CircleDollarSign className="w-6 h-6 text-red-500 flex-shrink-0" />
            <div>
              <p className="font-bold text-red-700 dark:text-red-400">PAYMENTS PAUSED</p>
              <p className="text-sm text-red-600 dark:text-red-400/80">
                {pauseStatus.reason || 'All escrow funding and booking completion is disabled.'}
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Open Disputes"
          value={stats.openDisputes}
          icon={<AlertTriangle className="w-5 h-5" />}
          href="/admin/disputes"
          className={stats.openDisputes > 0 ? 'border-amber-300 dark:border-amber-700' : ''}
        />
        <StatCard
          title="Pending Verifications"
          value={stats.pendingVerifications}
          icon={<Users className="w-5 h-5" />}
          href="/admin/humans?verified=false"
        />
        <StatCard
          title="Flagged Bounties"
          value={stats.flaggedBounties}
          icon={<ShieldAlert className="w-5 h-5" />}
          href="/admin/bounties?moderation=fail"
          className={stats.flaggedBounties > 0 ? 'border-red-300 dark:border-red-700' : ''}
        />
        <StatCard
          title="Today's Volume"
          value={totalVolume}
          icon={<DollarSign className="w-5 h-5" />}
          href="/admin/transactions"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Humans"
          value={stats.totalHumans}
          icon={<Users className="w-5 h-5" />}
          href="/admin/humans"
        />
        <StatCard
          title="Total Bookings"
          value={stats.totalBookings}
          icon={<CreditCard className="w-5 h-5" />}
          href="/admin/bookings"
        />
        <StatCard
          title="Active Bookings"
          value={stats.activeBookings}
          icon={<Briefcase className="w-5 h-5" />}
          href="/admin/bookings?status=in_progress"
        />
      </div>

      {/* Action Queue */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Action Queue</h2>
          <span className="text-sm text-muted-foreground">
            {actionQueue.length} items needing attention
          </span>
        </div>

        {actionQueue.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted-foreground">No items need attention</p>
          </div>
        ) : (
          <div className="space-y-3">
            {actionQueue.map((item) => (
              <ActionCard
                key={`${item.type}-${item.id}`}
                title={item.title}
                subtitle={item.subtitle}
                status={
                  item.type === 'verification' ? 'pending' :
                  item.type === 'dispute' ? 'warning' :
                  'error'
                }
                statusLabel={
                  item.type === 'verification' ? 'Verify' :
                  item.type === 'dispute' ? 'Dispute' :
                  'Flagged'
                }
                href={item.href}
                metadata={[
                  {
                    label: 'Created',
                    value: new Date(item.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }),
                  },
                ]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/admin/moderation"
          className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
        >
          <h3 className="font-semibold mb-1">Moderation Events</h3>
          <p className="text-sm text-muted-foreground">View content moderation decisions</p>
        </Link>
        <Link
          href="/admin/moderation/config"
          className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
        >
          <h3 className="font-semibold mb-1">Moderation Config</h3>
          <p className="text-sm text-muted-foreground">Adjust runtime configuration</p>
        </Link>
      </div>
    </div>
  )
}
