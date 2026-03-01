import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { requireHumanSession } from '@/lib/session-auth'

export const runtime = 'nodejs'

// GET /api/v1/bounties/[id]/my-application
// Returns the authenticated human's application + booking linkage for this bounty.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/bounties/[id]/my-application/route.ts', 'GET')
  const { id: bountyId } = await params

  const session = await requireHumanSession(log)
  if (!session.ok) return session.response
  const { human, supabase } = session

  const { data: application, error: applicationError } = await supabase
    .from('applications')
    .select('id, bounty_id, human_id, status, proposed_rate, estimated_hours, cover_letter, created_at')
    .eq('bounty_id', bountyId)
    .eq('human_id', human.id)
    .maybeSingle()

  if (applicationError) {
    return NextResponse.json({ success: false, error: applicationError.message }, { status: 500 })
  }

  if (!application) {
    return NextResponse.json({ success: true, data: null })
  }

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, status, escrow_status, payment_method, created_at, updated_at')
    .eq('application_id', application.id)
    .maybeSingle()

  if (bookingError) {
    return NextResponse.json({ success: false, error: bookingError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      ...application,
      booking,
    },
  })
}

