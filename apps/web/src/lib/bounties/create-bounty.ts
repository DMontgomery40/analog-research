import { z } from 'zod'
import {
  getModerationRuntimeConfig,
  moderateContent,
  moderationColumnsFromResult,
  persistModerationEvent,
  queueModerationRescan,
  toModerationResponse,
} from '@/lib/moderation'
import type { ModerationResult } from '@/lib/moderation'
import { recomputeQualityForBountyBestEffort } from '@/lib/quality-score-recompute'
import { logger } from '@/lib/logger'

const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/

export const createBountySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(20000),
  skills_required: z.array(z.string().min(1).max(64)).max(50),
  budget_min: z.number().int().min(500, 'Minimum budget is $5 (500 cents)'),
  budget_max: z.number().int().min(500, 'Minimum budget is $5 (500 cents)'),
  deadline: z.string().datetime().optional(),
  spots_available: z.number().int().min(1).max(500).optional(),
  pricing_mode: z.enum(['bid', 'fixed_per_spot']).optional(),
  fixed_spot_amount: z.number().int().positive().optional(),
  currency: z.string().trim().optional(),
  preferred_payment_method: z.enum(['stripe', 'crypto']).optional(),
  proof_review_mode: z.enum(['manual', 'llm_assisted']).optional(),
  proof_review_prompt: z.string().trim().max(8000).optional(),
}).superRefine((input, ctx) => {
  const pricingMode = input.pricing_mode ?? 'bid'

  if (pricingMode === 'fixed_per_spot' && input.fixed_spot_amount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fixed_spot_amount is required when pricing_mode is fixed_per_spot',
      path: ['fixed_spot_amount'],
    })
  }

  if (pricingMode === 'bid' && input.fixed_spot_amount !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fixed_spot_amount must be omitted when pricing_mode is bid',
      path: ['fixed_spot_amount'],
    })
  }

  if (
    pricingMode === 'fixed_per_spot'
    && input.fixed_spot_amount !== undefined
    && input.budget_min <= input.budget_max
    && (input.fixed_spot_amount < input.budget_min || input.fixed_spot_amount > input.budget_max)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fixed_spot_amount must be within [budget_min, budget_max]',
      path: ['fixed_spot_amount'],
    })
  }

  const proofReviewMode = input.proof_review_mode ?? 'manual'
  if (proofReviewMode !== 'llm_assisted' && input.proof_review_prompt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'proof_review_prompt can only be set when proof_review_mode is llm_assisted',
      path: ['proof_review_prompt'],
    })
  }
})

export type CreateBountyInput = z.infer<typeof createBountySchema>

export type CreateBountyActor = {
  actorType: 'agent' | 'human'
  actorId: string
  agentId: string
  humanId?: string | null
}

export type CreateBountyResult =
  | {
      ok: true
      data: any
      moderation: ReturnType<typeof toModerationResponse>
      decisionId: string | null
    }
  | {
      ok: false
      status: number
      error: string
      code?: string
      moderation?: ReturnType<typeof toModerationResponse>
      decisionId?: string | null
      retryable?: boolean
    }

export async function createBountyWithModeration(params: {
  supabase: any
  actor: CreateBountyActor
  data: CreateBountyInput
  failClosed: boolean
}): Promise<CreateBountyResult> {
  const { supabase, actor, data, failClosed } = params

  if (data.budget_min > data.budget_max) {
    return { ok: false, status: 400, error: 'budget_min must be less than budget_max' }
  }

  const currency = (data.currency || 'USD').toUpperCase()
  if (!CURRENCY_CODE_REGEX.test(currency)) {
    return { ok: false, status: 400, error: 'currency must be a 3-letter ISO-4217 code' }
  }

  const pricingMode = data.pricing_mode || 'bid'
  const spotsAvailable = data.spots_available ?? 1
  const proofReviewMode = data.proof_review_mode ?? 'manual'
  const llmAssistedEnabled = process.env.PROOF_AUTO_APPROVAL_ENABLED === 'true'

  if (proofReviewMode === 'llm_assisted' && !llmAssistedEnabled) {
    return {
      ok: false,
      status: 400,
      error: 'llm_assisted proof review is disabled. Set PROOF_AUTO_APPROVAL_ENABLED=true to enable.',
      code: 'PROOF_AUTO_APPROVAL_DISABLED',
    }
  }

  const { data: agentDefaults } = await supabase
    .from('agents')
    .select('default_payment_method')
    .eq('id', actor.agentId)
    .maybeSingle()

  const preferredPaymentMethod = data.preferred_payment_method
    ?? agentDefaults?.default_payment_method
    ?? null

  const proofReviewPrompt = proofReviewMode === 'llm_assisted'
    ? (data.proof_review_prompt?.trim() || null)
    : null

  const moderationConfig = await getModerationRuntimeConfig(supabase)
  const moderationText = [
    data.title,
    data.description,
    data.skills_required.join(', '),
  ].join('\n\n')

  let moderationResult: ModerationResult
  try {
    moderationResult = await moderateContent({
      supabase,
      config: moderationConfig,
      input: {
        surface: 'bounty',
        actorType: actor.actorType,
        actorId: actor.actorId,
        contentType: 'bounty',
        content: moderationText,
        metadata: {
          agent_id: actor.agentId,
          human_id: actor.humanId,
          currency,
          pricing_mode: pricingMode,
          spots_available: spotsAvailable,
          preferred_payment_method: preferredPaymentMethod,
          proof_review_mode: proofReviewMode,
        },
      },
    })
  } catch (error) {
    if (!failClosed) {
      throw error
    }

    await queueModerationRescan(supabase, {
      surface: 'bounty',
      contentType: 'bounty',
      contentId: null,
      actorType: actor.actorType,
      actorId: actor.actorId,
      contentText: moderationText,
      reason: 'preflight_error',
    })

    return {
      ok: false,
      status: 503,
      error: 'Moderation unavailable. Please retry later.',
      code: 'MODERATION_UNAVAILABLE',
      retryable: true,
    }
  }

  if (moderationResult.spamAction === 'cooldown') {
    const decisionId = await persistModerationEvent(supabase, {
      surface: 'bounty',
      contentType: 'bounty',
      contentId: null,
      actorType: actor.actorType,
      actorId: actor.actorId,
      result: moderationResult,
    })

    return {
      ok: false,
      status: 429,
      error: 'Too many similar bounty posts. Please wait before posting again.',
      code: 'SPAM_COOLDOWN',
      moderation: toModerationResponse(moderationResult, {
        contentType: 'bounty',
        contentId: null,
        decisionId,
      }),
      decisionId,
    }
  }

  if (moderationResult.decision === 'fail') {
    const decisionId = await persistModerationEvent(supabase, {
      surface: 'bounty',
      contentType: 'bounty',
      contentId: null,
      actorType: actor.actorType,
      actorId: actor.actorId,
      result: moderationResult,
    })

    return {
      ok: false,
      status: 422,
      error: 'Bounty blocked for safety or spam risk.',
      code: 'CONTENT_BLOCKED',
      moderation: toModerationResponse(moderationResult, {
        contentType: 'bounty',
        contentId: null,
        decisionId,
      }),
      decisionId,
    }
  }

  if (failClosed && moderationResult.needsRescan) {
    const decisionId = await persistModerationEvent(supabase, {
      surface: 'bounty',
      contentType: 'bounty',
      contentId: null,
      actorType: actor.actorType,
      actorId: actor.actorId,
      result: moderationResult,
    })

    await queueModerationRescan(supabase, {
      surface: 'bounty',
      contentType: 'bounty',
      contentId: null,
      actorType: actor.actorType,
      actorId: actor.actorId,
      contentText: moderationText,
      reason: moderationResult.timedOut ? 'timeout' : 'provider_error',
    })

    return {
      ok: false,
      status: 503,
      error: 'Moderation unavailable. Please retry later.',
      code: 'MODERATION_UNAVAILABLE',
      moderation: toModerationResponse(moderationResult, {
        contentType: 'bounty',
        contentId: null,
        decisionId,
      }),
      decisionId,
      retryable: true,
    }
  }

  const log = logger.withContext('lib/bounties/create-bounty.ts', 'createBountyWithModeration')
  const { data: inserted, error } = await supabase
    .from('bounties')
    .insert({
      agent_id: actor.agentId,
      title: data.title,
      description: data.description,
      skills_required: data.skills_required,
      budget_min: data.budget_min,
      budget_max: data.budget_max,
      deadline: data.deadline,
      spots_available: spotsAvailable,
      spots_filled: 0,
      pricing_mode: pricingMode,
      fixed_spot_amount: pricingMode === 'fixed_per_spot' ? data.fixed_spot_amount : null,
      currency,
      preferred_payment_method: preferredPaymentMethod,
      proof_review_mode: proofReviewMode,
      proof_review_prompt: proofReviewPrompt,
      ...moderationColumnsFromResult(moderationResult),
      is_spam_suppressed: moderationResult.spamAction === 'suppress',
    })
    .select('*')
    .single()

  if (error) {
    log.error('Failed to insert bounty', { agentId: actor.agentId, title: data.title }, { message: error.message, code: error.code })
    return { ok: false, status: 500, error: error.message }
  }

  const decisionId = await persistModerationEvent(supabase, {
    surface: 'bounty',
    contentType: 'bounty',
    contentId: inserted.id,
    actorType: actor.actorType,
    actorId: actor.actorId,
    result: moderationResult,
  })

  if (moderationResult.needsRescan) {
    await queueModerationRescan(supabase, {
      surface: 'bounty',
      contentType: 'bounty',
      contentId: inserted.id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      contentText: moderationText,
      reason: moderationResult.timedOut ? 'timeout' : 'provider_error',
    })
  }

  await recomputeQualityForBountyBestEffort(supabase, inserted.id)

  return {
    ok: true,
    data: inserted,
    moderation: toModerationResponse(moderationResult, {
      contentType: 'bounty',
      contentId: inserted.id,
      decisionId,
    }),
    decisionId,
  }
}
