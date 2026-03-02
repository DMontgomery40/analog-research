import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authenticateAgent, requireAgentWithScope } from '@/lib/api-auth'
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
import { getPublicShowcaseConfig, isBountyPubliclyVisible } from '@/lib/public-showcase'
import { handleSingleResult, isMissingColumnError, logOnError } from '@/lib/supabase/errors'
import { z } from 'zod'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'

export const runtime = 'nodejs'

const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/

const updateBountySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(20000).optional(),
  skills_required: z.array(z.string().min(1).max(64)).max(50).optional(),
  budget_min: z.number().int().min(500, 'Minimum budget is $5 (500 cents)').optional(),
  budget_max: z.number().int().min(500, 'Minimum budget is $5 (500 cents)').optional(),
  deadline: z.string().datetime().nullable().optional(),
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
  spots_available: z.number().int().min(1).max(500).optional(),
  pricing_mode: z.enum(['bid', 'fixed_per_spot']).optional(),
  fixed_spot_amount: z.number().int().positive().nullable().optional(),
  currency: z.string().trim().optional(),
  preferred_payment_method: z.enum(['stripe', 'crypto']).nullable().optional(),
  proof_review_mode: z.enum(['manual', 'llm_assisted']).optional(),
  proof_review_prompt: z.string().trim().max(8000).nullable().optional(),
})

function withCapacity<T extends { spots_available: number; spots_filled: number }>(bounty: T) {
  return {
    ...bounty,
    spots_remaining: Math.max(bounty.spots_available - bounty.spots_filled, 0),
    escrow_funding_model: 'deferred_per_booking' as const,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/bounties/[id]/route.ts', 'GET')
  const { id } = await params
  const agent = await authenticateAgent(request)
  const showcaseConfig = getPublicShowcaseConfig()

  if (agent) {
    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) return rateLimitResponse
  }

  if (!agent && !isBountyPubliclyVisible(id, showcaseConfig)) {
    return NextResponse.json({ success: false, error: 'Bounty not found' }, { status: 404 })
  }

  // Public read: use anon client so RLS applies and avoid service-role reads of suppressed rows.
  const anon = await createClient()
  const service = agent ? await createServiceClient() : null

  const { data: metaRow, error: metaError } = await anon
    .from('bounties')
    .select('id, agent_id, is_spam_suppressed')
    .eq('id', id)
    .maybeSingle()

  if (metaError) {
    log.error('Failed to fetch bounty metadata', { bountyId: id }, metaError)
    return NextResponse.json({ success: false, error: metaError.message }, { status: 500 })
  }

  if (!metaRow) {
    return NextResponse.json({ success: false, error: 'Bounty not found' }, { status: 404 })
  }

  const isOwner = Boolean(agent && metaRow.agent_id === agent.agentId)
  if (metaRow.is_spam_suppressed && !isOwner) {
    return NextResponse.json({ success: false, error: 'Bounty not found' }, { status: 404 })
  }

  const bountyClient = isOwner && service ? service : anon
  const ownerSelect = '*, agents(name, rating_average)'
  const publicSelect = 'id, agent_id, title, description, skills_required, budget_min, budget_max, deadline, status, application_count, view_count, created_at, updated_at, spots_available, spots_filled, pricing_mode, fixed_spot_amount, currency, preferred_payment_method, proof_review_mode, bounty_legitimacy_score, agents(name, rating_average)'
  const publicSelectFallback = 'id, agent_id, title, description, skills_required, budget_min, budget_max, deadline, status, application_count, view_count, created_at, updated_at, spots_available, spots_filled, pricing_mode, fixed_spot_amount, currency, bounty_legitimacy_score, agents(name, rating_average)'

  const initialResult = isOwner
    ? await bountyClient
      .from('bounties')
      .select(ownerSelect)
      .eq('id', id)
      .single()
    : await bountyClient
      .from('bounties')
      .select(publicSelect)
      .eq('id', id)
      .single()

  let bountyData: unknown = initialResult.data
  let bountyError = initialResult.error

  // Stay compatible with environments that haven't migrated preferred_payment_method/proof_review_mode yet.
  if (!isOwner && isMissingColumnError(bountyError, { table: 'bounties' })) {
    const retryResult = await bountyClient
      .from('bounties')
      .select(publicSelectFallback)
      .eq('id', id)
      .single()

    bountyData = retryResult.data
    bountyError = retryResult.error
  }

  const bountyResult = handleSingleResult(bountyData, bountyError, log, 'Bounty', { bountyId: id })
  if (bountyResult.response) return bountyResult.response
  const bounty = bountyResult.data as any

  let applications: Array<Record<string, unknown>> = []

  if (isOwner) {
    if (!service) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: ownerApplications, error: appError } = await service
      .from('applications')
      .select(`
        id,
        human_id,
        cover_letter,
        proposed_rate,
        estimated_hours,
        status,
        created_at,
        humans(id, name, avatar_url, rating_average, skills, human_legitimacy_score, human_legitimacy_confidence)
      `)
      .eq('bounty_id', id)
      .order('created_at', { ascending: false })

    if (appError) {
      log.error('Failed to fetch applications', { bountyId: id }, appError)
      return NextResponse.json({ success: false, error: appError.message }, { status: 500 })
    }

    applications = ownerApplications ?? []
  }

  // Increment view count (non-blocking)
  await logOnError(
    (service || anon)
      .from('bounties')
      .update({ view_count: Number(bounty.view_count || 0) + 1 })
      .eq('id', id),
    log,
    'Increment view count',
    { bountyId: id }
  )

  return NextResponse.json({
    success: true,
    data: {
      ...withCapacity(bounty),
      preferred_payment_method: bounty.preferred_payment_method ?? null,
      proof_review_mode: bounty.proof_review_mode ?? 'manual',
      applications,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/bounties/[id]/route.ts', 'PATCH')
  const { id } = await params

  const auth = await requireAgentWithScope(request, 'write')
  if (!auth.ok) return auth.response
  const { agent, supabase } = auth

  // Verify ownership and fetch current state.
  const { data: bountyData, error: bountyError } = await supabase
    .from('bounties')
    .select('id, agent_id, title, description, skills_required, budget_min, budget_max, status, spots_available, spots_filled, pricing_mode, fixed_spot_amount, currency, preferred_payment_method, proof_review_mode, proof_review_prompt')
    .eq('id', id)
    .single()

  const bountyResult = handleSingleResult(bountyData, bountyError, log, 'Bounty', { bountyId: id })
  if (bountyResult.response) return bountyResult.response
  const bounty = bountyResult.data

  if (bounty.agent_id !== agent.agentId) {
    log.warn('Forbidden: agent does not own bounty', { agentId: agent.agentId, bountyId: id })
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = updateBountySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  const updates = parsed.data
  const hasPreferredPaymentMethodUpdate = 'preferred_payment_method' in updates
  const hasProofReviewPromptUpdate = 'proof_review_prompt' in updates

  const nextBudgetMin = updates.budget_min ?? bounty.budget_min
  const nextBudgetMax = updates.budget_max ?? bounty.budget_max

  if (nextBudgetMin > nextBudgetMax) {
    return NextResponse.json({ success: false, error: 'budget_min must be less than budget_max' }, { status: 400 })
  }

  const nextSpotsAvailable = updates.spots_available ?? bounty.spots_available
  if (nextSpotsAvailable < bounty.spots_filled) {
    return NextResponse.json({ success: false, error: 'spots_available must be greater than or equal to spots_filled' }, { status: 400 })
  }

  const hasAcceptedApplications = bounty.spots_filled > 0

  const nextPricingMode = updates.pricing_mode ?? bounty.pricing_mode
  const nextCurrency = updates.currency ? updates.currency.toUpperCase() : bounty.currency

  if (!CURRENCY_CODE_REGEX.test(nextCurrency)) {
    return NextResponse.json({ success: false, error: 'currency must be a 3-letter ISO-4217 code' }, { status: 400 })
  }

  if (hasAcceptedApplications && updates.pricing_mode && updates.pricing_mode !== bounty.pricing_mode) {
    return NextResponse.json({ success: false, error: 'pricing_mode cannot be changed after any application is accepted' }, { status: 400 })
  }

  if (hasAcceptedApplications && updates.currency && nextCurrency !== bounty.currency) {
    return NextResponse.json({ success: false, error: 'currency cannot be changed after any application is accepted' }, { status: 400 })
  }

  let nextFixedSpotAmount: number | null

  if (nextPricingMode === 'fixed_per_spot') {
    if (updates.fixed_spot_amount !== undefined) {
      nextFixedSpotAmount = updates.fixed_spot_amount
    } else {
      nextFixedSpotAmount = bounty.fixed_spot_amount
    }

    if (nextFixedSpotAmount === null || nextFixedSpotAmount === undefined) {
      return NextResponse.json({ success: false, error: 'fixed_spot_amount is required when pricing_mode is fixed_per_spot' }, { status: 400 })
    }

    if (nextFixedSpotAmount <= 0) {
      return NextResponse.json({ success: false, error: 'fixed_spot_amount must be positive' }, { status: 400 })
    }

    if (nextFixedSpotAmount < nextBudgetMin || nextFixedSpotAmount > nextBudgetMax) {
      return NextResponse.json(
        { success: false, error: 'fixed_spot_amount must be within [budget_min, budget_max]' },
        { status: 400 }
      )
    }
  } else {
    nextFixedSpotAmount = null
  }

  const nextProofReviewMode = updates.proof_review_mode ?? bounty.proof_review_mode
  if (nextProofReviewMode === 'llm_assisted' && process.env.PROOF_AUTO_APPROVAL_ENABLED !== 'true') {
    return NextResponse.json(
      { success: false, error: 'llm_assisted proof review is disabled. Set PROOF_AUTO_APPROVAL_ENABLED=true to enable.' },
      { status: 400 }
    )
  }

  let nextProofReviewPrompt = hasProofReviewPromptUpdate
    ? updates.proof_review_prompt
    : bounty.proof_review_prompt
  if (nextProofReviewMode !== 'llm_assisted') {
    if (updates.proof_review_prompt && updates.proof_review_prompt.trim().length > 0) {
      return NextResponse.json(
        { success: false, error: 'proof_review_prompt is only allowed when proof_review_mode is llm_assisted' },
        { status: 400 }
      )
    }
    nextProofReviewPrompt = null
  }

  const patch: Record<string, unknown> = {
    budget_min: nextBudgetMin,
    budget_max: nextBudgetMax,
    spots_available: nextSpotsAvailable,
    pricing_mode: nextPricingMode,
    fixed_spot_amount: nextFixedSpotAmount,
    currency: nextCurrency,
    preferred_payment_method: hasPreferredPaymentMethodUpdate
      ? updates.preferred_payment_method
      : bounty.preferred_payment_method,
    proof_review_mode: nextProofReviewMode,
    proof_review_prompt: nextProofReviewPrompt,
  }

  if (updates.title !== undefined) {
    patch.title = updates.title
  }

  if (updates.description !== undefined) {
    patch.description = updates.description
  }

  if (updates.skills_required !== undefined) {
    patch.skills_required = updates.skills_required
  }

  if (updates.deadline !== undefined) {
    patch.deadline = updates.deadline
  }

  if (updates.status !== undefined) {
    patch.status = updates.status
  }

  // If the bounty was previously full and capacity is increased, re-open it.
  if (
    updates.spots_available !== undefined
    && updates.status === undefined
    && bounty.status === 'in_progress'
    && updates.spots_available > bounty.spots_filled
  ) {
    patch.status = 'open'
  }

  const shouldModerate = (
    updates.title !== undefined
    || updates.description !== undefined
    || updates.skills_required !== undefined
  )

  let moderationResult: Awaited<ReturnType<typeof moderateContent>> | null = null
  let moderationDecisionId: string | null = null
  let moderationText = ''

  if (shouldModerate) {
    const moderationConfig = await getModerationRuntimeConfig(supabase)
    const nextTitle = updates.title ?? bounty.title
    const nextDescription = updates.description ?? bounty.description
    const nextSkills = updates.skills_required ?? bounty.skills_required

    moderationText = [
      nextTitle,
      nextDescription,
      nextSkills.join(', '),
    ].join('\n\n')

    moderationResult = await moderateContent({
      supabase,
      config: moderationConfig,
      input: {
        surface: 'bounty',
        actorType: 'agent',
        actorId: agent.agentId,
        contentType: 'bounty',
        content: moderationText,
        contentId: id,
        metadata: {
          bounty_id: id,
          currency: nextCurrency,
          pricing_mode: nextPricingMode,
          spots_available: nextSpotsAvailable,
        },
      },
    })

    if (moderationResult.spamAction === 'cooldown') {
      moderationDecisionId = await persistModerationEvent(supabase, {
        surface: 'bounty',
        contentType: 'bounty',
        contentId: id,
        actorType: 'agent',
        actorId: agent.agentId,
        result: moderationResult,
      })

      return NextResponse.json({
        success: false,
        error: 'Too many similar bounty edits. Please wait before editing again.',
        code: 'SPAM_COOLDOWN',
        moderation: toModerationResponse(moderationResult, {
          contentType: 'bounty',
          contentId: id,
          decisionId: moderationDecisionId,
        }),
      }, { status: 429 })
    }

    if (moderationResult.decision === 'fail') {
      moderationDecisionId = await persistModerationEvent(supabase, {
        surface: 'bounty',
        contentType: 'bounty',
        contentId: id,
        actorType: 'agent',
        actorId: agent.agentId,
        result: moderationResult,
      })

      return NextResponse.json({
        success: false,
        error: 'Bounty blocked for safety or spam risk.',
        code: 'CONTENT_BLOCKED',
        moderation: toModerationResponse(moderationResult, {
          contentType: 'bounty',
          contentId: id,
          decisionId: moderationDecisionId,
        }),
      }, { status: 422 })
    }

    patch.is_spam_suppressed = moderationResult.spamAction === 'suppress'
    Object.assign(patch, moderationColumnsFromResult(moderationResult))
  }

  const { data, error } = await supabase
    .from('bounties')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) {
    log.error('Failed to update bounty', { bountyId: id }, error || { message: 'No data returned' })
    return NextResponse.json({ success: false, error: error?.message || 'Update failed' }, { status: 500 })
  }

  if (moderationResult) {
    moderationDecisionId = await persistModerationEvent(supabase, {
      surface: 'bounty',
      contentType: 'bounty',
      contentId: id,
      actorType: 'agent',
      actorId: agent.agentId,
      result: moderationResult,
    })

    if (moderationResult.needsRescan) {
      await queueModerationRescan(supabase, {
        surface: 'bounty',
        contentType: 'bounty',
        contentId: id,
        actorType: 'agent',
        actorId: agent.agentId,
        contentText: moderationText,
        reason: moderationResult.timedOut ? 'timeout' : 'provider_error',
      })
    }
  }

  await recomputeQualityForBountyBestEffort(supabase, id)

  return NextResponse.json({
    success: true,
    data: withCapacity(data),
    ...(moderationResult ? {
      moderation: toModerationResponse(moderationResult, {
        contentType: 'bounty',
        contentId: id,
        decisionId: moderationDecisionId,
      }),
    } : {}),
  })
}
