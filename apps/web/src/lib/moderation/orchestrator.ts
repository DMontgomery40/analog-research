import { assessLinkRisk } from './link-risk'
import { normalizeContent, runDeterministicRules, extractUrls } from './policy'
import { runModelClassification } from './classifier'
import { assessSpam, buildHash } from './spam-engine'
import type {
  ModerationDecision,
  ModerationInput,
  ModerationReasonCode,
  ModerationResult,
  ModerationRuntimeConfig,
  PersistModerationEventInput,
  QueueModerationRescanInput,
} from './types'

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function safeRandomId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function hardFailCodeSet(reasonCodes: ModerationReasonCode[]): Set<ModerationReasonCode> {
  return new Set(reasonCodes.filter((code) => (
    code === 'PHISHING_CREDENTIAL_THEFT'
    || code === 'SEED_OR_PRIVATE_KEY_REQUEST'
    || code === 'PROMPT_INJECTION_SECRET_EXFIL'
    || code === 'MALWARE_OR_EXECUTION_TRAP'
    || code === 'UPFRONT_PAYMENT_DECEPTION_HIGH_CONFIDENCE'
  )))
}

function estimateModelTokenReservation(normalizedContent: string): number {
  // Very rough: ~4 chars/token + overhead for system prompt/schema.
  // Reserve extra to cover escalation + strict retry in the classifier.
  const promptTokens = Math.ceil(normalizedContent.length / 4)
  const overheadTokens = 1200
  const completionTokens = 300
  const worstCaseCalls = 2

  const estimate = (promptTokens + overheadTokens + completionTokens) * worstCaseCalls
  return Math.max(250, Math.min(8000, estimate))
}

function getAppealUrl(contentType: string, contentId: string | null, decisionId: string | null): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  const params = new URLSearchParams()
  if (contentType) params.set('content_type', contentType)
  if (contentId) params.set('content_id', contentId)
  if (decisionId) params.set('decision_id', decisionId)

  const path = `/moderation/appeal?${params.toString()}`
  return base ? `${base}${path}` : path
}

export function moderationColumnsFromResult(result: ModerationResult) {
  return {
    moderation_decision: result.decision,
    moderation_reason_codes: result.reasonCodes,
    moderation_risk_score: result.riskScore,
    moderation_confidence: result.confidence,
    moderation_policy_version: result.policyVersion,
    moderation_updated_at: new Date().toISOString(),
  }
}

export function toModerationResponse(result: ModerationResult, params: { contentType: string; contentId: string | null; decisionId?: string | null }) {
  return {
    decision: result.decision,
    reason_codes: result.reasonCodes,
    risk_score: result.riskScore,
    confidence: result.confidence,
    appeal_url: result.decision === 'fail'
      ? getAppealUrl(params.contentType, params.contentId, params.decisionId || null)
      : null,
    spam_action: result.spamAction,
    policy_version: result.policyVersion,
  }
}

export async function moderateContent(params: {
  supabase: any
  input: ModerationInput
  config: ModerationRuntimeConfig
}): Promise<ModerationResult> {
  const { supabase, input, config } = params

  const runId = safeRandomId()
  const startedAtMs = Date.now()
  const timing: Record<string, number> = {}

  const tNormalize = Date.now()
  const normalizedContent = normalizeContent(input.content).slice(0, config.maxInputChars)
  timing.normalize_ms = Date.now() - tNormalize

  const urls = extractUrls(normalizedContent)
  const contentHash = buildHash(normalizedContent)

  const tDeterministic = Date.now()
  const deterministic = runDeterministicRules(normalizedContent)
  timing.deterministic_ms = Date.now() - tDeterministic

  const tLinkRisk = Date.now()
  const linkRisk = await assessLinkRisk(normalizedContent, supabase)
  timing.link_risk_ms = Date.now() - tLinkRisk

  const tSpam = Date.now()
  const spam = await assessSpam({
    supabase,
    surface: input.surface,
    actorType: input.actorType,
    actorId: input.actorId,
    normalizedContent,
    urls,
    contentHash,
  })
  timing.spam_ms = Date.now() - tSpam

  let decision: ModerationDecision = 'allow'
  let confidence = Math.max(deterministic.confidence, linkRisk.confidence)
  let riskScore = Math.max(deterministic.riskScore, linkRisk.riskScore)
  let model: string | null = null
  let timedOut = false
  let needsRescan = false
  let modelTelemetry: Record<string, unknown> = {}
  let budgetTelemetry: Record<string, unknown> = { status: 'unknown' }

  const reasonCodes = unique<ModerationReasonCode>([
    ...deterministic.reasonCodes,
    ...linkRisk.reasonCodes,
    ...spam.reasonCodes,
  ])

  const hardFailSignals = hardFailCodeSet(reasonCodes)

  if (deterministic.hardFail) {
    decision = 'fail'
  } else {
    const supportsRpc = typeof (supabase as any)?.rpc === 'function'
    const reservationTokens = estimateModelTokenReservation(normalizedContent)

    if (supportsRpc) {
      const tBudget = Date.now()
      const { data: allowed, error: budgetError } = await (supabase as any).rpc(
        'try_consume_moderation_tokens_v1',
        { p_tokens: reservationTokens }
      )
      timing.budget_ms = Date.now() - tBudget

      if (budgetError) {
        budgetTelemetry = {
          status: 'error',
          reservation_tokens: reservationTokens,
          daily_token_budget: config.dailyTokenBudget,
          error: { message: budgetError.message, code: budgetError.code },
        }
      } else {
        budgetTelemetry = {
          status: allowed ? 'allowed' : 'exceeded',
          reservation_tokens: reservationTokens,
          daily_token_budget: config.dailyTokenBudget,
        }
      }
    } else {
      budgetTelemetry = {
        status: 'unsupported',
        reservation_tokens: reservationTokens,
        daily_token_budget: config.dailyTokenBudget,
      }
    }

    const budgetAllowsModel = budgetTelemetry.status === 'allowed' || budgetTelemetry.status === 'unsupported'

    if (budgetAllowsModel) {
      const tModel = Date.now()
      const modelResult = await runModelClassification(normalizedContent, config)
      timing.model_ms = Date.now() - tModel

      model = modelResult.model
      modelTelemetry = {
        status: modelResult.status,
        model: modelResult.model,
        error: modelResult.error,
        attempts: modelResult.attempts.map((attempt) => ({
          model: attempt.model,
          strict: attempt.strict,
          status: attempt.status,
          error: attempt.error,
          meta: attempt.meta,
          output: attempt.output,
        })),
      }

      if (modelResult.status === 'ok' && modelResult.output) {
        const output = modelResult.output
        confidence = Math.max(confidence, output.confidence)
        riskScore = Math.max(riskScore, output.risk_score)
        reasonCodes.push(...(output.reason_codes as ModerationReasonCode[]))

        const modelHardFailReasons = hardFailCodeSet(output.reason_codes as ModerationReasonCode[])

        if (
          output.decision_suggestion === 'fail'
          && output.confidence >= config.failConfidence
          && modelHardFailReasons.size > 0
        ) {
          decision = 'fail'
        } else if (output.decision_suggestion === 'warn' && output.confidence >= config.warnConfidence) {
          decision = 'warn'
        } else {
          decision = 'allow'
        }
      } else {
        timedOut = modelResult.status === 'timeout'
        needsRescan = true
        decision = 'unscanned'
        if (urls.length > 0) {
          reasonCodes.push('SUSPICIOUS_EXTERNAL_LINK')
        }
        riskScore = Math.max(riskScore, 0.4)
        confidence = Math.max(confidence, 0.4)
      }
    } else {
      // Budget exceeded: skip model call and fall back to deterministic + link risk + spam only.
      modelTelemetry = {
        status: 'skipped',
        reason: 'daily_token_budget_exceeded',
      }
      model = null
      timedOut = false
      needsRescan = false
      decision = 'allow'
    }

    if (decision === 'allow' && (deterministic.warning || linkRisk.reasonCodes.length > 0)) {
      decision = 'warn'
      confidence = Math.max(confidence, config.warnConfidence)
      riskScore = Math.max(riskScore, 0.58)
    }
  }

  if (hardFailSignals.size > 0 && confidence >= config.failConfidence) {
    decision = 'fail'
  }

  if (spam.action === 'block') {
    decision = 'fail'
  }

  const dedupedReasons = unique(reasonCodes)
  timing.total_ms = Date.now() - startedAtMs

  return {
    decision,
    reasonCodes: dedupedReasons,
    riskScore: clamp(riskScore),
    confidence: clamp(confidence),
    spamAction: spam.action,
    policyVersion: config.policyVersion,
    provider: config.provider,
    model,
    summary: decision === 'fail'
      ? 'Content blocked due to high-confidence safety or spam risk.'
      : decision === 'warn'
        ? 'Content allowed with warning signals.'
        : decision === 'unscanned'
          ? 'Content allowed in fail-open mode and queued for rescan.'
          : 'Content allowed.',
    needsRescan,
    timedOut,
    contentHash,
    evidence: {
      trace: {
        run_id: runId,
        started_at: new Date(startedAtMs).toISOString(),
        timings_ms: timing,
        input: {
          original_length: input.content.length,
          normalized_length: normalizedContent.length,
          url_count: urls.length,
          max_input_chars: config.maxInputChars,
        },
        model: modelTelemetry,
        budget: budgetTelemetry,
        decision_notes: {
          deterministic_hard_fail: Boolean(deterministic.hardFail),
          hard_fail_signal_count: hardFailSignals.size,
          spam_action: spam.action,
          fail_open_needs_rescan: needsRescan,
        },
      },
      deterministic,
      linkRisk,
      spam,
      urls,
      metadata: input.metadata || {},
    },
  }
}

export async function persistModerationEvent(
  supabase: any,
  input: PersistModerationEventInput,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('moderation_events')
    .insert({
      surface: input.surface,
      content_type: input.contentType,
      content_id: input.contentId,
      actor_type: input.actorType,
      actor_id: input.actorId,
      decision: input.result.decision,
      reason_codes: input.result.reasonCodes,
      risk_score: input.result.riskScore,
      confidence: input.result.confidence,
      spam_action: input.result.spamAction,
      policy_version: input.result.policyVersion,
      provider: input.result.provider,
      model: input.result.model,
      raw_content_hash: input.result.contentHash,
      evidence: input.result.evidence,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Failed to persist moderation event', {
      surface: input.surface,
      contentType: input.contentType,
      contentId: input.contentId,
      actorType: input.actorType,
      actorId: input.actorId,
      decision: input.result.decision,
      error: error.message,
    })
    return null
  }

  return (data?.id as string | undefined) || null
}

export async function queueModerationRescan(
  supabase: any,
  input: QueueModerationRescanInput,
): Promise<void> {
  const { error } = await supabase
    .from('moderation_rescan_queue')
    .insert({
      surface: input.surface,
      content_type: input.contentType,
      content_id: input.contentId,
      actor_type: input.actorType,
      actor_id: input.actorId,
      content_text: input.contentText,
      reason: input.reason,
      status: 'pending',
      attempt_count: 0,
      next_run_at: new Date().toISOString(),
    })

  if (error) {
    console.error('Failed to queue moderation rescan', {
      surface: input.surface,
      contentType: input.contentType,
      contentId: input.contentId,
      actorType: input.actorType,
      actorId: input.actorId,
      reason: input.reason,
      error: error.message,
    })
  }
}
