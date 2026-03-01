import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'
import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { acceptApplicationAsAgent, rejectApplicationAsAgent } from '@/lib/bounties/application-actions'
import { z } from 'zod'

const manageApplicationSchema = z.object({
  applicationId: z.string().uuid(),
  action: z.enum(['accept', 'reject']),
})

// GET /api/v1/bounties/[id]/applications/manage
// Owner or API-authenticated ResearchAgent endpoint for listing applications.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/bounties/[id]/applications/manage/route.ts', 'GET')
  const { id: bountyId } = await params

  const authResult = await requireOwnerAgentAccess(request, 'read')
  if (!authResult.ok) return authResult.response
  const { actingAgentId, serviceClient } = authResult.context

  const { data: bountyData, error: bountyError } = await serviceClient
    .from('bounties')
    .select('id, agent_id')
    .eq('id', bountyId)
    .single()

  const bountyResult = handleSingleResult(bountyData, bountyError, log, 'Bounty', { bountyId })
  if (bountyResult.response) return bountyResult.response
  const bounty = bountyResult.data

  if (bounty.agent_id !== actingAgentId) {
    log.warn('Forbidden: caller does not own bounty', { actingAgentId, bountyId })
    return NextResponse.json({ success: false, error: 'Forbidden - you do not own this bounty' }, { status: 403 })
  }

  const { data: applications, error: applicationsError } = await serviceClient
    .from('applications')
    .select(`
      id,
      human_id,
      status,
      proposed_rate,
      estimated_hours,
      cover_letter,
      created_at,
      humans(id, name, avatar_url, bio, skills, rating_average, location, human_legitimacy_score, human_legitimacy_confidence)
    `)
    .eq('bounty_id', bountyId)
    .order('created_at', { ascending: false })

  if (applicationsError) {
    log.error('Failed to fetch applications', { bountyId }, applicationsError)
    return NextResponse.json({ success: false, error: applicationsError.message }, { status: 500 })
  }

  const applicationIds = (applications ?? []).map((application) => application.id)
  let bookingsByApplicationId = new Map<string, {
    id: string
    status: string
    escrow_status: string
    payment_method: 'stripe' | 'crypto' | null
  }>()

  if (applicationIds.length > 0) {
    const { data: bookings, error: bookingsError } = await serviceClient
      .from('bookings')
      .select('id, application_id, status, escrow_status, payment_method')
      .in('application_id', applicationIds)

    if (bookingsError) {
      return NextResponse.json({ success: false, error: bookingsError.message }, { status: 500 })
    }

    bookingsByApplicationId = new Map(
      (bookings ?? [])
        .filter((booking) => Boolean(booking.application_id))
        .map((booking) => [
          booking.application_id as string,
          {
            id: booking.id,
            status: booking.status,
            escrow_status: booking.escrow_status,
            payment_method: booking.payment_method,
          },
        ])
    )
  }

  const applicationsWithBookings = (applications ?? []).map((application) => ({
    ...application,
    booking: bookingsByApplicationId.get(application.id) || null,
  }))

  return NextResponse.json({
    success: true,
    data: applicationsWithBookings,
  })
}

// POST /api/v1/bounties/[id]/applications/manage
// Owner or API-authenticated ResearchAgent endpoint for accepting/rejecting applications.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bountyId } = await params

  const authResult = await requireOwnerAgentAccess(request, 'write')
  if (!authResult.ok) return authResult.response
  const { actingAgentId, serviceClient } = authResult.context

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = manageApplicationSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  const { applicationId, action } = parsed.data

  if (action === 'accept') {
    const result = await acceptApplicationAsAgent({
      supabase: serviceClient,
      agentId: actingAgentId,
      bountyId,
      applicationId,
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      data: {
        application_id: applicationId,
        status: 'accepted',
        booking: result.booking,
        capacity: result.capacity,
      },
    })
  }

  const result = await rejectApplicationAsAgent({
    supabase: serviceClient,
    agentId: actingAgentId,
    bountyId,
    applicationId,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }

  return NextResponse.json({ success: true, data: result.application })
}
