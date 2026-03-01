import { type AcceptCapacityResult, mapAcceptError } from '@/lib/bounty-application-capacity'
import { recomputeQualityForBountyBestEffort } from '@/lib/quality-score-recompute'
import { logger } from '@/lib/logger'
import { logOnError } from '@/lib/supabase/errors'
import { ensureConversationLink } from '@/lib/conversation-links'

export type ApplicationAcceptResult =
  | {
      ok: true
      status: 'accepted'
      booking: any
      capacity: {
        spots_available: number
        spots_filled: number
        spots_remaining: number
        status: string
        is_full: boolean
      }
    }
  | { ok: false; status: number; error: string }

export type ApplicationRejectResult =
  | { ok: true; status: 'rejected'; application: any }
  | { ok: false; status: number; error: string }

export async function acceptApplicationAsAgent(params: {
  supabase: any
  agentId: string
  bountyId: string
  applicationId: string
}): Promise<ApplicationAcceptResult> {
  const { supabase, agentId, bountyId, applicationId } = params
  const log = logger.withContext('lib/bounties/application-actions.ts', 'acceptApplicationAsAgent')

  const { data: bounty, error: bountyError } = await supabase
    .from('bounties')
    .select('id, agent_id, title')
    .eq('id', bountyId)
    .single()

  if (bountyError) {
    log.error('Failed to fetch bounty', { bountyId, agentId }, { message: bountyError.message, code: bountyError.code })
    return { ok: false, status: 500, error: bountyError.message }
  }

  if (!bounty || bounty.agent_id !== agentId) {
    log.warn('Forbidden: agent does not own bounty', { bountyId, agentId })
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  const { data: application, error: applicationError } = await supabase
    .from('applications')
    .select('id, bounty_id, human_id, proposed_rate, estimated_hours, status')
    .eq('id', applicationId)
    .eq('bounty_id', bountyId)
    .single()

  if (applicationError) {
    if (applicationError.code === 'PGRST116') {
      log.warn('Application not found', { applicationId, bountyId })
      return { ok: false, status: 404, error: 'Application not found' }
    }
    log.error('Failed to fetch application', { applicationId, bountyId }, { message: applicationError.message, code: applicationError.code })
    return { ok: false, status: 500, error: applicationError.message }
  }

  if (!application) {
    log.warn('Application not found', { applicationId, bountyId })
    return { ok: false, status: 404, error: 'Application not found' }
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_bounty_application_with_capacity', {
    p_bounty_id: bountyId,
    p_application_id: applicationId,
    p_agent_id: agentId,
  })

  if (rpcError) {
    log.error('RPC accept_bounty_application_with_capacity failed', { bountyId, applicationId, agentId }, { message: rpcError.message, code: rpcError.code })
    return { ok: false, status: 500, error: rpcError.message }
  }

  const result = (rpcResult?.[0] || null) as AcceptCapacityResult | null

  if (!result) {
    return { ok: false, status: 500, error: 'Unable to accept application' }
  }

  if (!result.accepted) {
    const mapped = mapAcceptError(result.reason)
    return { ok: false, status: mapped.status, error: mapped.error }
  }

  const bookingAmount = result.pricing_mode === 'fixed_per_spot'
    ? result.fixed_spot_amount
    : result.proposed_rate

  if (!bookingAmount || bookingAmount <= 0) {
    return { ok: false, status: 500, error: 'Unable to determine booking amount' }
  }

  const { data: existingBooking, error: existingBookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('application_id', applicationId)
    .maybeSingle()

  if (existingBookingError) {
    log.error('Failed to lookup booking for application', { applicationId, bountyId }, { message: existingBookingError.message, code: existingBookingError.code })
    return { ok: false, status: 500, error: existingBookingError.message }
  }

  let booking = existingBooking

  if (!booking) {
    const { data: insertedBooking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        agent_id: agentId,
        human_id: result.human_id,
        bounty_id: bountyId,
        application_id: applicationId,
        title: result.bounty_title || bounty.title,
        description: `Accepted application for bounty: ${result.bounty_title || bounty.title}`,
        amount: bookingAmount,
        currency: result.bounty_currency,
        estimated_hours: result.estimated_hours,
      })
      .select('*')
      .single()

    if (bookingError && bookingError.code !== '23505') {
      log.error('Failed to create booking', { applicationId, bountyId }, { message: bookingError.message, code: bookingError.code })
      return { ok: false, status: 500, error: bookingError.message }
    }

    if (!insertedBooking) {
      const { data: bookingAfterConflict, error: bookingAfterConflictError } = await supabase
        .from('bookings')
        .select('*')
        .eq('application_id', applicationId)
        .maybeSingle()
      if (bookingAfterConflictError) {
        log.warn('Failed to fetch existing booking after conflict', { applicationId, error: bookingAfterConflictError.message })
      }
      booking = bookingAfterConflict
    } else {
      booking = insertedBooking
    }
  }

  // Create or update conversation link (non-blocking)
  const conversationLinkResult = await ensureConversationLink(supabase, {
    agentId,
    humanId: result.human_id,
    bookingId: booking?.id ?? null,
    bountyId: booking?.id ? bountyId : null,
  })
  if (conversationLinkResult.error) {
    log.error('Create conversation link failed (non-blocking)', {
      bountyId,
      humanId: result.human_id,
      bookingId: booking?.id ?? null,
    }, {
      message: conversationLinkResult.error.message,
      code: conversationLinkResult.error.code,
    })
  }

  if (result.reason === 'accepted') {
    // Notify human (non-blocking)
    await logOnError(
      supabase.from('notifications').insert({
        recipient_type: 'human',
        recipient_id: result.human_id,
        type: 'application_accepted',
        title: 'Application accepted!',
        body: `Your application for "${result.bounty_title || bounty.title}" was accepted.`,
        data: { bounty_id: bountyId, booking_id: booking?.id },
      }),
      log,
      'Create acceptance notification',
      { bountyId, humanId: result.human_id }
    )
  }

  await recomputeQualityForBountyBestEffort(supabase, bountyId)

  return {
    ok: true,
    status: 'accepted',
    booking,
    capacity: {
      spots_available: result.spots_available,
      spots_filled: result.spots_filled,
      spots_remaining: result.spots_remaining,
      status: result.bounty_status,
      is_full: result.spots_remaining === 0,
    },
  }
}

export async function rejectApplicationAsAgent(params: {
  supabase: any
  agentId: string
  bountyId: string
  applicationId: string
}): Promise<ApplicationRejectResult> {
  const { supabase, agentId, bountyId, applicationId } = params
  const log = logger.withContext('lib/bounties/application-actions.ts', 'rejectApplicationAsAgent')

  const { data: bounty, error: bountyError } = await supabase
    .from('bounties')
    .select('id, agent_id, title')
    .eq('id', bountyId)
    .single()

  if (bountyError) {
    log.error('Failed to fetch bounty', { bountyId, agentId }, { message: bountyError.message, code: bountyError.code })
    return { ok: false, status: 500, error: bountyError.message }
  }

  if (!bounty || bounty.agent_id !== agentId) {
    log.warn('Forbidden: agent does not own bounty', { bountyId, agentId })
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  const { data: application, error: applicationError } = await supabase
    .from('applications')
    .select('id, bounty_id, human_id, proposed_rate, estimated_hours, status')
    .eq('id', applicationId)
    .eq('bounty_id', bountyId)
    .single()

  if (applicationError) {
    if (applicationError.code === 'PGRST116') {
      log.warn('Application not found', { applicationId, bountyId })
      return { ok: false, status: 404, error: 'Application not found' }
    }
    log.error('Failed to fetch application', { applicationId, bountyId }, { message: applicationError.message, code: applicationError.code })
    return { ok: false, status: 500, error: applicationError.message }
  }

  if (!application) {
    log.warn('Application not found', { applicationId, bountyId })
    return { ok: false, status: 404, error: 'Application not found' }
  }

  if (application.status === 'rejected') {
    return { ok: true, status: 'rejected', application }
  }

  if (application.status !== 'pending') {
    return { ok: false, status: 409, error: `Application is already ${application.status}` }
  }

  const { data: transitionedApplication, error } = await supabase
    .from('applications')
    .update({ status: 'rejected' })
    .eq('id', applicationId)
    .eq('bounty_id', bountyId)
    .eq('status', 'pending')
    .select('id, bounty_id, human_id, proposed_rate, estimated_hours, status')
    .maybeSingle()

  if (error) {
    log.error('Failed to reject application', { applicationId, bountyId }, { message: error.message, code: error.code })
    return { ok: false, status: 500, error: error.message }
  }

  if (!transitionedApplication) {
    const { data: latestApplication, error: latestError } = await supabase
      .from('applications')
      .select('id, bounty_id, human_id, proposed_rate, estimated_hours, status')
      .eq('id', applicationId)
      .eq('bounty_id', bountyId)
      .single()

    if (latestError || !latestApplication) {
      log.warn('Application not found during rejection', { applicationId, bountyId, error: latestError?.message })
      return { ok: false, status: 404, error: 'Application not found' }
    }

    if (latestApplication.status === 'rejected') {
      return { ok: true, status: 'rejected', application: latestApplication }
    }

    return { ok: false, status: 409, error: `Application is already ${latestApplication.status}` }
  }

  // Notify human (non-blocking)
  await logOnError(
    supabase.from('notifications').insert({
      recipient_type: 'human',
      recipient_id: transitionedApplication.human_id,
      type: 'application_rejected',
      title: 'Application not selected',
      body: `Your application for "${bounty.title}" was not selected.`,
      data: { bounty_id: bountyId },
    }),
    log,
    'Create rejection notification',
    { bountyId, humanId: transitionedApplication.human_id }
  )

  await recomputeQualityForBountyBestEffort(supabase, bountyId)

  return { ok: true, status: 'rejected', application: transitionedApplication }
}
