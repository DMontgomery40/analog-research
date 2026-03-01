import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { authenticateAgent } from '@/lib/api-auth'
import {
  getModerationRuntimeConfig,
  moderateContent,
  moderationColumnsFromResult,
  persistModerationEvent,
  queueModerationRescan,
  toModerationResponse,
} from '@/lib/moderation'
import { recomputeQualityForBountyBestEffort } from '@/lib/quality-score-recompute'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'
import { requireHumanSession } from '@/lib/session-auth'
import { createAgentWorkflowNotificationWithOwnerFanout } from '@/lib/notifications'
import { z } from 'zod'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'

export const runtime = 'nodejs'

const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/

const createApplicationSchema = z.object({
  cover_letter: z.string().max(10000).optional(),
  proposed_rate: z.number().int().positive().optional(),
  estimated_hours: z.number().positive().optional(),
  currency: z.string().trim().optional(),
})

// GET /api/v1/bounties/[id]/applications - list applications (bounty creator only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/bounties/[id]/applications/route.ts', 'GET')
  const { id: bountyId } = await params

  const agent = await authenticateAgent(request)
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
  if (rateLimitResponse) return rateLimitResponse

  const supabase = await createServiceClient()

  // Verify bounty ownership
  const { data: bountyData, error: bountyError } = await supabase
    .from('bounties')
    .select('id, agent_id')
    .eq('id', bountyId)
    .single()

  const bountyResult = handleSingleResult(bountyData, bountyError, log, 'Bounty', { bountyId })
  if (bountyResult.response) return bountyResult.response
  const bounty = bountyResult.data

  if (bounty.agent_id !== agent.agentId) {
    log.warn('Forbidden: agent does not own bounty', { agentId: agent.agentId, bountyId })
    return NextResponse.json({ success: false, error: 'Forbidden - only bounty creator can view applications' }, { status: 403 })
  }

  // Get applications with human details
  const { data: applications, error } = await supabase
    .from('applications')
    .select(`
      id,
      bounty_id,
      human_id,
      cover_letter,
      proposed_rate,
      estimated_hours,
      status,
      created_at,
      updated_at,
      humans(id, name, avatar_url, bio, skills, rating_average, rating_count, location)
    `)
    .eq('bounty_id', bountyId)
    .order('created_at', { ascending: false })

  if (error) {
    log.error('Failed to fetch applications', { bountyId }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: applications })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const postLog = logger.withContext('api/v1/bounties/[id]/applications/route.ts', 'POST')
  const { id: bountyId } = await params

  const session = await requireHumanSession(postLog)
  if (!session.ok) return session.response
  const { human } = session

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = createApplicationSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  // Check bounty exists and is open
  const serviceClient = await createServiceClient()
  const { data: bountyData, error: bountyError } = await serviceClient
    .from('bounties')
    .select('id, status, agent_id, spots_available, spots_filled, pricing_mode, fixed_spot_amount, budget_min, budget_max, currency, title')
    .eq('id', bountyId)
    .single()

  const bountyResult = handleSingleResult(bountyData, bountyError, postLog, 'Bounty', { bountyId })
  if (bountyResult.response) return bountyResult.response
  const bounty = bountyResult.data

  if (bounty.status !== 'open') {
    return NextResponse.json({ success: false, error: 'Bounty is not open for applications' }, { status: 400 })
  }

  const spotsRemaining = Math.max((bounty.spots_available || 0) - (bounty.spots_filled || 0), 0)
  if (spotsRemaining <= 0) {
    return NextResponse.json({ success: false, error: 'Bounty is already full' }, { status: 409 })
  }

  const requestedCurrency = parsed.data.currency?.toUpperCase()
  if (requestedCurrency && !CURRENCY_CODE_REGEX.test(requestedCurrency)) {
    return NextResponse.json({ success: false, error: 'currency must be a 3-letter ISO-4217 code' }, { status: 400 })
  }

  if (requestedCurrency && requestedCurrency !== bounty.currency) {
    return NextResponse.json({ success: false, error: 'Application currency must match bounty currency' }, { status: 400 })
  }

  let proposedRate: number

  if (bounty.pricing_mode === 'bid') {
    if (parsed.data.proposed_rate === undefined) {
      return NextResponse.json({ success: false, error: 'proposed_rate is required when pricing_mode is bid' }, { status: 400 })
    }
    proposedRate = parsed.data.proposed_rate

    if (proposedRate < bounty.budget_min || proposedRate > bounty.budget_max) {
      return NextResponse.json(
        { success: false, error: 'proposed_rate must be within the bounty budget range' },
        { status: 400 }
      )
    }
  } else {
    if (!bounty.fixed_spot_amount || bounty.fixed_spot_amount <= 0) {
      return NextResponse.json({ success: false, error: 'Bounty fixed spot amount is invalid' }, { status: 500 })
    }

    if (parsed.data.proposed_rate !== undefined && parsed.data.proposed_rate !== bounty.fixed_spot_amount) {
      return NextResponse.json({ success: false, error: 'proposed_rate must match fixed_spot_amount for fixed pricing' }, { status: 400 })
    }

    proposedRate = parsed.data.proposed_rate ?? bounty.fixed_spot_amount
  }

  const moderationConfig = await getModerationRuntimeConfig(serviceClient)
  const moderationText = [
    parsed.data.cover_letter || '',
    `proposed_rate=${proposedRate}`,
    parsed.data.estimated_hours !== undefined ? `estimated_hours=${parsed.data.estimated_hours}` : '',
  ].filter(Boolean).join('\n')

  const moderationResult = await moderateContent({
    supabase: serviceClient,
    config: moderationConfig,
    input: {
      surface: 'application',
      actorType: 'human',
      actorId: human.id,
      contentType: 'application',
      content: moderationText,
      contentId: bountyId,
      metadata: {
        bounty_id: bountyId,
        bounty_agent_id: bounty.agent_id,
        bounty_currency: bounty.currency,
        pricing_mode: bounty.pricing_mode,
      },
    },
  })

  if (moderationResult.spamAction === 'cooldown') {
    const decisionId = await persistModerationEvent(serviceClient, {
      surface: 'application',
      contentType: 'application',
      contentId: null,
      actorType: 'human',
      actorId: human.id,
      result: moderationResult,
    })

    return NextResponse.json({
      success: false,
      error: 'Too many similar applications. Please wait before applying again.',
      code: 'SPAM_COOLDOWN',
      moderation: toModerationResponse(moderationResult, {
        contentType: 'application',
        contentId: null,
        decisionId,
      }),
    }, { status: 429 })
  }

  if (moderationResult.decision === 'fail') {
    const decisionId = await persistModerationEvent(serviceClient, {
      surface: 'application',
      contentType: 'application',
      contentId: null,
      actorType: 'human',
      actorId: human.id,
      result: moderationResult,
    })

    return NextResponse.json({
      success: false,
      error: 'Application blocked for safety or spam risk.',
      code: 'CONTENT_BLOCKED',
      moderation: toModerationResponse(moderationResult, {
        contentType: 'application',
        contentId: null,
        decisionId,
      }),
    }, { status: 422 })
  }

  // Create application
  const { data, error } = await serviceClient
    .from('applications')
    .insert({
      bounty_id: bountyId,
      human_id: human.id,
      cover_letter: parsed.data.cover_letter,
      proposed_rate: proposedRate,
      estimated_hours: parsed.data.estimated_hours,
      ...moderationColumnsFromResult(moderationResult),
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ success: false, error: 'You have already applied to this bounty' }, { status: 400 })
    }
    postLog.error('Failed to create application', { bountyId, humanId: human.id }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Notify ResearchAgent and owner-human (if configured) about new application.
  const notificationResult = await createAgentWorkflowNotificationWithOwnerFanout({
    supabase: serviceClient,
    agentId: bounty.agent_id,
    type: 'new_application',
    title: 'New application received',
    body: `A human has applied to your bounty \"${bounty.title}\"`,
    data: { bounty_id: bountyId, application_id: data.id },
    ownerTitle: 'New bounty application received',
    ownerBody: `A human applied to your ResearchAgent's bounty \"${bounty.title}\".`,
  })

  if (!notificationResult.agentNotificationId) {
    postLog.error('Failed to create ResearchAgent notification for new_application', {
      bountyId,
      applicationId: data.id,
      agentId: bounty.agent_id,
    })
  }

  let decisionId: string | null = null
  try {
    decisionId = await persistModerationEvent(serviceClient, {
      surface: 'application',
      contentType: 'application',
      contentId: data.id,
      actorType: 'human',
      actorId: human.id,
      result: moderationResult,
    })
  } catch (error) {
    postLog.error('Failed to persist moderation event (non-blocking)', { bountyId, applicationId: data.id, humanId: human.id }, error instanceof Error ? { message: error.message } : { message: String(error) })
  }

  if (moderationResult.needsRescan) {
    try {
      await queueModerationRescan(serviceClient, {
        surface: 'application',
        contentType: 'application',
        contentId: data.id,
        actorType: 'human',
        actorId: human.id,
        contentText: moderationText,
        reason: moderationResult.timedOut ? 'timeout' : 'provider_error',
      })
    } catch (error) {
      postLog.error('Failed to queue moderation rescan (non-blocking)', { bountyId, applicationId: data.id, humanId: human.id }, error instanceof Error ? { message: error.message } : { message: String(error) })
    }
  }

  await recomputeQualityForBountyBestEffort(serviceClient, bountyId)

  return NextResponse.json({
    success: true,
    data,
    moderation: toModerationResponse(moderationResult, {
      contentType: 'application',
      contentId: data.id,
      decisionId,
    }),
  }, { status: 201 })
}
