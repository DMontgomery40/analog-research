import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { handleSingleResult, logOnError } from '@/lib/supabase/errors'
import { getHumanForUser } from '@/lib/session-auth'
import { requireSessionOrAgent } from '@/lib/session-or-agent-auth'
import { z } from 'zod'

export const runtime = 'nodejs'

const createReviewSchema = z.object({
  booking_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
})

export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/reviews/route.ts', 'POST')
  const auth = await requireSessionOrAgent(request, { agentScope: 'write' })
  if (!auth.ok) return auth.response
  const { supabase, user, agent } = auth

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createReviewSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 })
  }

  const serviceClient = await createServiceClient()

  // Get booking
  const { data: bookingData, error: bookingError } = await serviceClient
    .from('bookings')
    .select('id, agent_id, human_id, status')
    .eq('id', parsed.data.booking_id)
    .single()

  const bookingResult = handleSingleResult(bookingData, bookingError, log, 'Booking', { bookingId: parsed.data.booking_id })
  if (bookingResult.response) return bookingResult.response
  const booking = bookingResult.data

  if (booking.status !== 'completed') {
    return NextResponse.json({ success: false, error: 'Can only review completed bookings' }, { status: 400 })
  }

  let reviewerType: 'human' | 'agent'
  let reviewerId: string
  let revieweeType: 'human' | 'agent'
  let revieweeId: string

  if (user) {
    const humanResult = await getHumanForUser(supabase, log, user.id)
    if (!humanResult.ok) return humanResult.response
    const { human } = humanResult

    if (booking.human_id !== human.id) {
      log.warn('Forbidden: human not part of booking', { humanId: human.id, bookingId: booking.id })
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    reviewerType = 'human'
    reviewerId = human.id
    revieweeType = 'agent'
    revieweeId = booking.agent_id
  } else if (agent) {
    if (booking.agent_id !== agent.agentId) {
      log.warn('Forbidden: agent not part of booking', { agentId: agent.agentId, bookingId: booking.id })
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    reviewerType = 'agent'
    reviewerId = agent.agentId
    revieweeType = 'human'
    revieweeId = booking.human_id
  } else {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Check if already reviewed
  const { data: existingReview, error: existingReviewError } = await serviceClient
    .from('reviews')
    .select('id')
    .eq('booking_id', parsed.data.booking_id)
    .eq('reviewer_type', reviewerType)
    .single()

  // PGRST116 = not found, which is expected here (no existing review)
  if (existingReviewError && existingReviewError.code !== 'PGRST116') {
    log.error('Failed to check existing review', { bookingId: parsed.data.booking_id }, { message: existingReviewError.message, code: existingReviewError.code })
    return NextResponse.json({ success: false, error: existingReviewError.message }, { status: 500 })
  }

  if (existingReview) {
    return NextResponse.json({ success: false, error: 'You have already reviewed this booking' }, { status: 400 })
  }

  const { data, error } = await serviceClient
    .from('reviews')
    .insert({
      booking_id: parsed.data.booking_id,
      reviewer_type: reviewerType,
      reviewer_id: reviewerId,
      reviewee_type: revieweeType,
      reviewee_id: revieweeId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    })
    .select()
    .single()

  if (error) {
    log.error('Failed to create review', { bookingId: parsed.data.booking_id, reviewerType }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Notify reviewee (non-blocking)
  await logOnError(
    serviceClient.from('notifications').insert({
      recipient_type: revieweeType,
      recipient_id: revieweeId,
      type: 'review_received',
      title: 'New review received',
      body: `You received a ${parsed.data.rating}-star review`,
      data: { booking_id: parsed.data.booking_id, review_id: data.id },
    }),
    log,
    'Create review notification',
    { bookingId: parsed.data.booking_id, revieweeType, revieweeId }
  )

  return NextResponse.json({ success: true, data }, { status: 201 })
}
