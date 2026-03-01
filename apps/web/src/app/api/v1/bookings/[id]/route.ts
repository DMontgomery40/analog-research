import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authenticateAgent } from '@/lib/api-auth'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'
import { resolveProofAttachmentsForResponse } from '@/lib/proof-attachments'
import { resolveSessionOwnerAgent } from '@/lib/session-owner-agent'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/bookings/[id]/route.ts', 'GET')
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const agent = await authenticateAgent(request)

  if (!user && !agent) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (agent) {
    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) return rateLimitResponse
  }

  const serviceClient = await createServiceClient()

  const { data, error } = await serviceClient
    .from('bookings')
    .select(`
      *,
      agents(id, name),
      humans(id, name, avatar_url, rating_average, stripe_onboarding_complete),
      proofs(*),
      bounties(id, title),
      reviews(id, rating, comment, reviewer_type, created_at)
    `)
    .eq('id', id)
    .single()

  const bookingResult = handleSingleResult(data, error, log, 'Booking', { bookingId: id })
  if (bookingResult.response) return bookingResult.response
  const booking = bookingResult.data

  // Verify access (session and/or API key). If both are present, allow either valid path.
  let userHumanId: string | null = null

  if (user) {
    const { data: humanData, error: humanError } = await supabase
      .from('humans')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (humanError) {
      log.warn('Failed to fetch human profile for user', { userId: user.id, error: humanError.message, code: humanError.code })
    }

    userHumanId = humanData?.id ?? null
  }

  let ownerAgentId: string | null = null
  if (user) {
    const ownerAgent = await resolveSessionOwnerAgent(serviceClient, user.id)
    ownerAgentId = ownerAgent?.agentId ?? null
  }

  const allowedAsHuman = Boolean(userHumanId && booking.human_id === userHumanId)
  const allowedAsAgent = Boolean(
    (agent && booking.agent_id === agent.agentId)
    || (ownerAgentId && booking.agent_id === ownerAgentId)
  )

  if (!allowedAsHuman && !allowedAsAgent) {
    log.warn('Forbidden: caller does not own booking', { bookingId: id, userId: user?.id ?? null, agentId: agent?.agentId ?? null })
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const proofs = await Promise.all(
    (booking.proofs ?? []).map(async (proof: any) => ({
      ...proof,
      attachments: await resolveProofAttachmentsForResponse(serviceClient, proof.attachments),
    }))
  )

  return NextResponse.json({
    success: true,
    data: {
      ...booking,
      proofs,
      permissions: {
        can_submit_proof: allowedAsHuman,
        can_review_proof: allowedAsAgent,
      },
    },
  })
}
