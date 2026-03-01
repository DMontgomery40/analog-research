import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/admin-auth'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const supabase = await createServiceClient()

  // Get counts in parallel
  const [
    openDisputesResult,
    pendingVerificationsResult,
    flaggedBountiesResult,
    todayBookingsResult,
  ] = await Promise.all([
    // Open disputes count
    supabase
      .from('disputes')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'under_review']),

    // Humans pending verification (unverified)
    supabase
      .from('humans')
      .select('id', { count: 'exact', head: true })
      .eq('is_verified', false),

    // Bounties flagged by moderation
    supabase
      .from('bounties')
      .select('id', { count: 'exact', head: true })
      .eq('moderation_decision', 'fail'),

    // Today's completed bookings for volume calculation
    supabase
      .from('bookings')
      .select('amount, currency')
      .eq('status', 'completed')
      .gte('completed_at', new Date().toISOString().split('T')[0]),
  ])

  // Calculate volume by currency
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

  return NextResponse.json({
    success: true,
    data: {
      openDisputes: openDisputesResult.count || 0,
      pendingVerifications: pendingVerificationsResult.count || 0,
      flaggedBounties: flaggedBountiesResult.count || 0,
      todayVolume: volumeByCurrency,
    },
  })
}
