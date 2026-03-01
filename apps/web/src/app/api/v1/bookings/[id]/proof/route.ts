import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/api-auth'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { handleSingleResult, logOnError } from '@/lib/supabase/errors'
import { requireHumanSession } from '@/lib/session-auth'
import { createAgentWorkflowNotificationWithOwnerFanout } from '@/lib/notifications'
import { normalizeProofAttachmentsForInsert, resolveProofAttachmentsForResponse } from '@/lib/proof-attachments'
import { z } from 'zod'

export const runtime = 'nodejs'

const submitProofSchema = z.object({
  description: z.string().min(1),
  hours_worked: z.number().positive(),
  attachments: z.array(
    z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      path: z.string().min(1).optional(),
      url: z.string().url().optional(),
    }).refine((value) => Boolean(value.path || value.url), {
      message: 'Attachment must include path or url',
    })
  ).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/bookings/[id]/proof/route.ts', 'GET')
  const { id: bookingId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const agent = await authenticateAgent(request)

  if (!user && !agent) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = await createServiceClient()

  const { data: booking, error: bookingError } = await serviceClient
    .from('bookings')
    .select('id, agent_id, human_id')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingError) {
    log.error('Failed to fetch booking', { bookingId }, { message: bookingError.message, code: bookingError.code })
    return NextResponse.json({ success: false, error: bookingError.message }, { status: 500 })
  }

  if (!booking) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }

  if (user) {
    const { data: humanData, error: humanError } = await supabase
      .from('humans')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (humanError || !humanData) {
      return NextResponse.json({ success: false, error: 'Human profile not found' }, { status: 404 })
    }

    if (booking.human_id !== humanData.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
  } else if (agent && booking.agent_id !== agent.agentId) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await serviceClient
    .from('proofs')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    log.error('Failed to list proofs', { bookingId }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const proofs = await Promise.all(
    (data ?? []).map(async (proof) => ({
      ...proof,
      attachments: await resolveProofAttachmentsForResponse(serviceClient, proof.attachments),
    }))
  )

  return NextResponse.json({ success: true, data: proofs })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/bookings/[id]/proof/route.ts', 'POST')
  const { id: bookingId } = await params

  const session = await requireHumanSession(log)
  if (!session.ok) return session.response
  const { human, supabase } = session

  const serviceClient = await createServiceClient()

  // Verify booking belongs to human
  const { data: bookingData, error: bookingError } = await serviceClient
    .from('bookings')
    .select('id, human_id, agent_id, status, escrow_status, title')
    .eq('id', bookingId)
    .single()

  const bookingResult = handleSingleResult(bookingData, bookingError, log, 'Booking', { bookingId })
  if (bookingResult.response) return bookingResult.response
  const booking = bookingResult.data

  if (booking.human_id !== human.id) {
    log.warn('Forbidden: human does not own booking', { humanId: human.id, bookingId })
    return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
  }

  if (booking.escrow_status !== 'funded') {
    return NextResponse.json(
      { success: false, error: 'Escrow must be funded before proof can be submitted' },
      { status: 400 }
    )
  }

  if (!['pending', 'funded', 'in_progress', 'submitted'].includes(booking.status)) {
    return NextResponse.json({ success: false, error: 'Booking is not in a valid state for proof submission' }, { status: 400 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = submitProofSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  const { attachments, error: attachmentError } = normalizeProofAttachmentsForInsert(parsed.data.attachments, bookingId)
  if (attachmentError) {
    return NextResponse.json({ success: false, error: attachmentError }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('proofs')
    .insert({
      booking_id: bookingId,
      human_id: human.id,
      description: parsed.data.description,
      hours_worked: parsed.data.hours_worked,
      attachments,
    })
    .select()
    .single()

  if (error) {
    log.error('Failed to create proof', { bookingId, humanId: human.id }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Update booking status (non-blocking)
  const submittedUpdate: { status: string; submitted_at?: string } = { status: 'submitted' }
  if (booking.status !== 'submitted') {
    submittedUpdate.submitted_at = new Date().toISOString()
  }

  await logOnError(
    serviceClient
      .from('bookings')
      .update(submittedUpdate)
      .eq('id', bookingId),
    log,
    'Update booking status to submitted',
    { bookingId }
  )

  const notificationResult = await createAgentWorkflowNotificationWithOwnerFanout({
    supabase: serviceClient,
    agentId: booking.agent_id,
    type: 'proof_submitted',
    title: 'Work proof submitted',
    body: `Human submitted proof for booking: ${booking.title}`,
    data: { booking_id: bookingId, proof_id: data.id },
    ownerTitle: 'Proof submitted for review',
    ownerBody: `A human submitted proof for booking \"${booking.title}\".`,
  })

  if (!notificationResult.agentNotificationId) {
    log.error('Failed to create ResearchAgent notification for proof submission', {
      bookingId,
      proofId: data.id,
      agentId: booking.agent_id,
    })
  }

  return NextResponse.json({ success: true, data }, { status: 201 })
}
