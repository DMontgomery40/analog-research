import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DollarSign, Briefcase, Star, Clock } from 'lucide-react'
import { QualityFormulaLinks, QualityScoreBadge } from '@/components/quality-score-badge'

interface Human {
  id: string
  name: string
  total_earnings: number
  completed_bookings: number
  rating_average: number
  stripe_onboarding_complete: boolean
  human_legitimacy_score?: number
  human_legitimacy_confidence?: number
}

interface Booking {
  id: string
  title: string
  status: string
  amount: number
  agents: { name: string } | null
}

interface Bounty {
  id: string
  title: string
  budget_min: number
  budget_max: number
  application_count: number
  bounty_legitimacy_score?: number
  bounty_legitimacy_confidence?: number
}

async function getDashboardData(userId: string) {
  const supabase = await createClient()

  const { data: humanData } = await supabase
    .from('humans')
    .select('id, name, total_earnings, completed_bookings, rating_average, stripe_onboarding_complete, human_legitimacy_score, human_legitimacy_confidence')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)

  const human = (humanData && humanData.length > 0 ? humanData[0] : null) as Human | null

  const { data: bookingsData } = await supabase
    .from('bookings')
    .select('id, title, status, amount, agents(name)')
    .eq('human_id', human?.id || '')
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: bountiesData } = await supabase
    .from('bounties')
    .select('id, title, budget_min, budget_max, application_count, bounty_legitimacy_score, bounty_legitimacy_confidence')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(5)

  return {
    human,
    recentBookings: ((bookingsData || []) as unknown as Booking[]),
    openBounties: ((bountiesData || []) as unknown as Bounty[]),
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { human, recentBookings, openBounties } = await getDashboardData(user.id)

  if (!human) {
    return (
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Complete Your Profile</h2>
          <p className="text-muted-foreground mb-6">
            Set up your profile to start receiving bookings from AI agents.
          </p>
          <Link
            href="/dashboard/profile"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors"
          >
            Set Up Profile
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Welcome back, {human.name.split(' ')[0]}</h1>
          <QualityScoreBadge
            label="HLS"
            score={human.human_legitimacy_score}
            confidence={human.human_legitimacy_confidence}
          />
        </div>
        <p className="text-muted-foreground">Here&apos;s what&apos;s happening with your account</p>
        <QualityFormulaLinks className="mt-2" />
      </div>

      {!human.stripe_onboarding_complete && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-blue-600">Set up bank payouts</p>
            <p className="text-sm text-muted-foreground">
              Connect your Stripe account so approved bookings can pay out to your bank.
            </p>
          </div>
          <Link
            href="/dashboard/profile#payment-methods"
            className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors"
          >
            Set up payouts
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Earnings"
          value={`$${(human.total_earnings / 100).toFixed(2)}`}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <StatCard
          title="Completed Jobs"
          value={human.completed_bookings.toString()}
          icon={<Briefcase className="w-5 h-5" />}
        />
        <StatCard
          title="Rating"
          value={human.rating_average > 0 ? `${human.rating_average}/5` : 'N/A'}
          icon={<Star className="w-5 h-5" />}
        />
        <StatCard
          title="Active Bookings"
          value={recentBookings.filter((b) => b.status === 'in_progress').length.toString()}
          icon={<Clock className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Bookings */}
        <div className="bg-card border border-border rounded-xl">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Recent Bookings</h2>
            <Link href="/dashboard/bookings" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="p-4">
            {recentBookings.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No bookings yet</p>
            ) : (
              <div className="space-y-4">
                {recentBookings.map((booking) => (
                  <div key={booking.id} className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{booking.title}</p>
                      <p className="text-sm text-muted-foreground">
                        ${(booking.amount / 100).toFixed(2)}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      booking.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                      booking.status === 'in_progress' ? 'bg-primary/10 text-primary' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {booking.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Open Bounties */}
        <div className="bg-card border border-border rounded-xl">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Open Bounties</h2>
            <Link href="/dashboard/browse" className="text-sm text-primary hover:underline">
              Browse all
            </Link>
          </div>
          <div className="p-4">
            {openBounties.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No open bounties</p>
            ) : (
              <div className="space-y-4">
                {openBounties.map((bounty) => (
                  <Link
                    key={bounty.id}
                    href={`/dashboard/bounties/${bounty.id}`}
                    className="block hover:bg-accent p-2 -mx-2 rounded-md transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{bounty.title}</p>
                      <QualityScoreBadge
                        label="BLS"
                        score={bounty.bounty_legitimacy_score}
                        confidence={bounty.bounty_legitimacy_confidence}
                      />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span>${(bounty.budget_min / 100).toFixed(0)} - ${(bounty.budget_max / 100).toFixed(0)}</span>
                      <span>{bounty.application_count} applications</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className="text-primary">{icon}</div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
