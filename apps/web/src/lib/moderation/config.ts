import { createServiceClient } from '@/lib/supabase/server'
import type { ModerationRuntimeConfig } from './types'

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const MODERATION_DEFAULTS: ModerationRuntimeConfig = {
  provider: 'openrouter',
  modelPrimary: process.env.MODERATION_MODEL_PRIMARY || 'mistralai/mistral-nemo',
  modelEscalation: process.env.MODERATION_MODEL_ESCALATION || 'meta-llama/llama-guard-3-8b',
  timeoutMs: numberFromEnv(process.env.MODERATION_TIMEOUT_MS, 8000),
  failConfidence: numberFromEnv(process.env.MODERATION_FAIL_CONFIDENCE, 0.93),
  warnConfidence: numberFromEnv(process.env.MODERATION_WARN_CONFIDENCE, 0.6),
  maxInputChars: numberFromEnv(process.env.MODERATION_MAX_INPUT_CHARS, 12000),
  dailyTokenBudget: numberFromEnv(process.env.MODERATION_DAILY_TOKEN_BUDGET, 1_000_000),
  policyVersion: process.env.MODERATION_POLICY_VERSION || '2026-02-08-v1',
}

function mergeConfigRow(row: Record<string, unknown> | null): ModerationRuntimeConfig {
  return {
    provider: ((row?.provider as string | undefined) || process.env.MODERATION_PROVIDER || MODERATION_DEFAULTS.provider) as 'openrouter',
    modelPrimary: (row?.model_primary as string | undefined) || MODERATION_DEFAULTS.modelPrimary,
    modelEscalation: (row?.model_escalation as string | undefined) || MODERATION_DEFAULTS.modelEscalation,
    timeoutMs: Number(row?.timeout_ms ?? MODERATION_DEFAULTS.timeoutMs),
    failConfidence: Number(row?.fail_confidence ?? MODERATION_DEFAULTS.failConfidence),
    warnConfidence: Number(row?.warn_confidence ?? MODERATION_DEFAULTS.warnConfidence),
    maxInputChars: Number(row?.max_input_chars ?? MODERATION_DEFAULTS.maxInputChars),
    dailyTokenBudget: Number(row?.daily_token_budget ?? MODERATION_DEFAULTS.dailyTokenBudget),
    policyVersion: (row?.policy_version as string | undefined) || MODERATION_DEFAULTS.policyVersion,
  }
}

export async function getModerationRuntimeConfig(serviceClient?: Awaited<ReturnType<typeof createServiceClient>>): Promise<ModerationRuntimeConfig> {
  const supabase = serviceClient || await createServiceClient()

  const { data: row, error } = await supabase
    .from('moderation_runtime_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    return MODERATION_DEFAULTS
  }

  if (!row) {
    await supabase
      .from('moderation_runtime_config')
      .upsert({
        id: 1,
        provider: MODERATION_DEFAULTS.provider,
        model_primary: MODERATION_DEFAULTS.modelPrimary,
        model_escalation: MODERATION_DEFAULTS.modelEscalation,
        timeout_ms: MODERATION_DEFAULTS.timeoutMs,
        fail_confidence: MODERATION_DEFAULTS.failConfidence,
        warn_confidence: MODERATION_DEFAULTS.warnConfidence,
        max_input_chars: MODERATION_DEFAULTS.maxInputChars,
        daily_token_budget: MODERATION_DEFAULTS.dailyTokenBudget,
        policy_version: MODERATION_DEFAULTS.policyVersion,
      })

    return MODERATION_DEFAULTS
  }

  return mergeConfigRow(row)
}

export async function updateModerationRuntimeConfig(
  updates: Partial<ModerationRuntimeConfig>,
  updatedBy: string,
  serviceClient?: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<ModerationRuntimeConfig> {
  const supabase = serviceClient || await createServiceClient()
  const current = await getModerationRuntimeConfig(supabase)

  const next = {
    ...current,
    ...updates,
  }

  await supabase
    .from('moderation_runtime_config')
    .upsert({
      id: 1,
      provider: next.provider,
      model_primary: next.modelPrimary,
      model_escalation: next.modelEscalation,
      timeout_ms: next.timeoutMs,
      fail_confidence: next.failConfidence,
      warn_confidence: next.warnConfidence,
      max_input_chars: next.maxInputChars,
      daily_token_budget: next.dailyTokenBudget,
      policy_version: next.policyVersion,
      updated_by: updatedBy,
    })

  return next
}
