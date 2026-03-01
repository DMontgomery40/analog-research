import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Briefcase, Clock, DollarSign, CheckCircle } from 'lucide-react'

interface Booking {
  id: string
  title: string
  status: string
  amount: number
  platform_fee: number
  estimated_hours: number | null
  created_at: string
  agents: { name: string } | null
}

async function getBookings(
  humanId: string,
  pagination: { limit: number; offset: number }
): Promise<{ bookings: Booking[]; total: number }> {
  const supabase = await createClient()

  const { data, error, count } = await supabase
    .from('bookings')
    .select('id, title, status, amount, platform_fee, estimated_hours, created_at, agents(name)', { count: 'exact' })
    .eq('human_id', humanId)
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1)

  if (error) {
    console.error('[bookings/page] Failed to fetch bookings:', error.message, error.code)
    return { bookings: [], total: 0 }
  }

  return { bookings: ((data || []) as unknown) as Booking[], total: count || 0 }
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-500',
  funded: 'bg-blue-500/10 text-blue-500',
  in_progress: 'bg-primary/10 text-primary',
  submitted: 'bg-purple-500/10 text-purple-500',
  completed: 'bg-green-500/10 text-green-500',
  disputed: 'bg-red-500/10 text-red-500',
  cancelled: 'bg-muted text-muted-foreground',
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearchParams = (await searchParams) ?? {}

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: humanResult, error: humanError } = await supabase
    .from('humans')
    .select('id, total_earnings, completed_bookings')
    .eq('user_id', user.id)
    .maybeSingle()

  if (humanError) {
    console.error('[bookings/page] Failed to fetch human profile:', humanError.message, humanError.code)
  }

  const humanData = humanResult as { id: string; total_earnings: number; completed_bookings: number } | null

  if (!humanData) {
    return (
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Complete Your Profile</h2>
          <p className="text-muted-foreground mb-6">
            Set up your profile to start receiving bookings.
          </p>
          <Link
            href="/dashboard/profile"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium"
          >
            Set Up Profile
          </Link>
        </div>
      </div>
    )
  }

  const humanId = humanData.id

  const limit = (() => {
    const raw = resolvedSearchParams.limit
    const value = Array.isArray(raw) ? raw[0] : raw
    const parsed = Number.parseInt(value || '', 10)
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 10), 100) : 20
  })()

  const page = (() => {
    const raw = resolvedSearchParams.page
    const value = Array.isArray(raw) ? raw[0] : raw
    const parsed = Number.parseInt(value || '', 10)
    return Number.isFinite(parsed) ? Math.max(parsed, 1) : 1
  })()

  const offset = (page - 1) * limit

  const { bookings, total } = await getBookings(humanId, { limit, offset })

  const { count: activeCount, error: activeCountError } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('human_id', humanId)
    .in('status', ['funded', 'in_progress', 'submitted'])

  if (activeCountError) {
    console.error('[bookings/page] Failed to compute active bookings count:', activeCountError.message, activeCountError.code)
  }

  const stats = {
    active: activeCount || 0,
    completed: humanData.completed_bookings || 0,
    totalEarned: humanData.total_earnings || 0,
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">My Bookings</h1>
        <p className="text-muted-foreground">Manage your active and past bookings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Active Bookings</span>
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <p className="text-2xl font-bold">{stats.active}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Completed</span>
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-2xl font-bold">{stats.completed}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total Earned</span>
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <p className="text-2xl font-bold">${(stats.totalEarned / 100).toFixed(2)}</p>
        </div>
      </div>

      {/* Bookings list */}
      {bookings.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No bookings yet</h2>
          <p className="text-muted-foreground mb-6">
            Browse open bounties and apply to get started
          </p>
          <Link
            href="/dashboard/browse"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium"
          >
            Browse Bounties
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <Link
              key={booking.id}
              href={`/dashboard/bookings/${booking.id}`}
              className="block bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{booking.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    by {booking.agents?.name || 'Unknown Agent'}
                  </p>

                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4" />
                      <span>${(booking.amount / 100).toFixed(2)}</span>
                    </div>
                    {booking.estimated_hours && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span>{booking.estimated_hours}h estimated</span>
                      </div>
                    )}
                    <span className="text-xs">
                      Created {new Date(booking.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${statusColors[booking.status]}`}>
                  {booking.status.replace('_', ' ')}
                </span>
              </div>
            </Link>
          ))}

          {total > limit && (
            <div className="flex items-center justify-between pt-4">
              <Link
                href={`/dashboard/bookings?page=${Math.max(page - 1, 1)}&limit=${limit}`}
                aria-disabled={page <= 1}
                className={`px-4 py-2 border border-border rounded-md font-medium transition-colors ${
                  page <= 1 ? 'opacity-50 pointer-events-none' : 'hover:bg-accent'
                }`}
              >
                Previous
              </Link>
              <span className="text-sm text-muted-foreground">
                Page {page} of {Math.max(Math.ceil(total / limit), 1)}
              </span>
              <Link
                href={`/dashboard/bookings?page=${page + 1}&limit=${limit}`}
                aria-disabled={offset + limit >= total}
                className={`px-4 py-2 border border-border rounded-md font-medium transition-colors ${
                  offset + limit >= total ? 'opacity-50 pointer-events-none' : 'hover:bg-accent'
                }`}
              >
                Next
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
