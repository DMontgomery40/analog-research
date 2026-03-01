import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authenticateAgent, requireAgentWithScope } from '@/lib/api-auth'
import { logger } from '@/lib/logger'
import { handleSingleResult, handleMutationResult } from '@/lib/supabase/errors'
import { calculatePlatformFee } from '@/lib/stripe'
import { createNotification } from '@/lib/notifications'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'
import { ensureConversationLink } from '@/lib/conversation-links'
import { z } from 'zod'

export const runtime = 'nodejs'

const createBookingSchema = z.object({
  human_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(10000),
  amount: z.number().int().positive(),
  scheduled_start: z.string().datetime().optional(),
  estimated_hours: z.number().positive().optional(),
})

export async function GET(request: NextRequest) {
  const log = logger.withContext('api/v1/bookings/route.ts', 'GET')
  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')

  // Check for human auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Check for agent auth
  const agent = await authenticateAgent(request)

  if (!user && !agent) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = await createServiceClient()

  if (user) {
    // Human viewing their bookings
    const { data: humanData, error: humanError } = await supabase
      .from('humans')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const humanResult = handleSingleResult(humanData, humanError, log, 'Human profile', { userId: user.id })
    if (humanResult.response) return humanResult.response
    const human = humanResult.data

    let query = serviceClient
      .from('bookings')
      .select('*, agents(name)')
      .eq('human_id', human.id)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  }

  if (agent) {
    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) return rateLimitResponse

    // Agent viewing their bookings
    let query = serviceClient
      .from('bookings')
      .select('*, humans(id, name, avatar_url, rating_average)')
      .eq('agent_id', agent.agentId)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  }

  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
}

export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/bookings/route.ts', 'POST')
  const auth = await requireAgentWithScope(request, 'write')
  if (!auth.ok) return auth.response
  const { agent, supabase } = auth

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = createBookingSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  // Verify human exists
  const { data: humanData, error: humanError } = await supabase
    .from('humans')
    .select('id, name')
    .eq('id', parsed.data.human_id)
    .single()

  const humanResult = handleSingleResult(humanData, humanError, log, 'Human', { humanId: parsed.data.human_id })
  if (humanResult.response) return humanResult.response

  const platformFee = calculatePlatformFee(parsed.data.amount)

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      agent_id: agent.agentId,
      human_id: parsed.data.human_id,
      title: parsed.data.title,
      description: parsed.data.description,
      amount: parsed.data.amount,
      platform_fee: platformFee,
      scheduled_start: parsed.data.scheduled_start,
      estimated_hours: parsed.data.estimated_hours,
    })
    .select()
    .single()

  const bookingResult = handleMutationResult(data, error, log, 'Create booking', {
    agentId: agent.agentId,
    humanId: parsed.data.human_id,
  })
  if (bookingResult.response) return bookingResult.response
  const booking = bookingResult.data

  // Create conversation (non-blocking)
  const { error: conversationError } = await ensureConversationLink(supabase, {
    agentId: agent.agentId,
    humanId: parsed.data.human_id,
    bookingId: booking.id,
  })
  if (conversationError) {
    log.error('Create conversation failed (non-blocking)', { bookingId: booking.id }, {
      message: conversationError.message,
      code: conversationError.code,
    })
  }

  // Notify human about new booking
  await createNotification(supabase, {
    recipientType: 'human',
    recipientId: parsed.data.human_id,
    type: 'booking_created',
    title: 'New booking request',
    body: `You have a new booking: ${parsed.data.title}`,
    data: { booking_id: booking.id },
  })

  return NextResponse.json({ success: true, data: booking }, { status: 201 })
}
