import { z } from 'zod'

import { logger } from '@/lib/logger'
import { EXTERNAL_PROVIDERS, type ExternalProvider } from '@/lib/external-jobs/types'

export const TOOL_POLICY_SCHEMA_VERSION = '1.0' as const

export type ToolPolicySource = 'api' | 'mcp'

export type AgentToolPolicyV1 = {
  schema_version: typeof TOOL_POLICY_SCHEMA_VERSION
  money: {
    enabled: boolean
    max_per_action_cents: number
    max_daily_cents: number
  }
  external_jobs: {
    enabled: boolean
    allowed_providers: ExternalProvider[]
  }
}

const log = logger.withContext('lib/tool-policy.ts', 'tool-policy')

export const agentToolPolicyV1Schema: z.ZodType<AgentToolPolicyV1> = z.object({
  schema_version: z.literal(TOOL_POLICY_SCHEMA_VERSION),
  money: z.object({
    enabled: z.boolean(),
    max_per_action_cents: z.number().int().min(0),
    max_daily_cents: z.number().int().min(0),
  }),
  external_jobs: z.object({
    enabled: z.boolean(),
    allowed_providers: z.array(z.enum(EXTERNAL_PROVIDERS)),
  }),
})

export const DEFAULT_AGENT_TOOL_POLICY: AgentToolPolicyV1 = {
  schema_version: TOOL_POLICY_SCHEMA_VERSION,
  money: {
    enabled: true,
    max_per_action_cents: 5000,
    max_daily_cents: 10000,
  },
  external_jobs: {
    enabled: false,
    allowed_providers: [],
  },
}

export type ToolPolicyReasonCode =
  | 'ALLOWED'
  | 'MONEY_DISABLED'
  | 'MONEY_MAX_PER_ACTION_EXCEEDED'
  | 'MONEY_MAX_DAILY_EXCEEDED'
  | 'MONEY_DAILY_SPEND_UNAVAILABLE'
  | 'EXTERNAL_JOBS_DISABLED'
  | 'EXTERNAL_PROVIDER_NOT_ALLOWED'

export type ToolPolicyDecision =
  | { allowed: true; reasonCode: 'ALLOWED'; reason: string }
  | { allowed: false; reasonCode: ToolPolicyReasonCode; reason: string }

function toStartOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
}

function toStartOfNextUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0))
}

export function resolveToolPolicySourceFromHeaders(headers: Headers): ToolPolicySource {
  const source = (headers.get('x-analogresearch-source') || '').trim().toLowerCase()
  return source === 'mcp' ? 'mcp' : 'api'
}

export function evaluateMoneyPolicy(params: {
  policy: AgentToolPolicyV1
  amountCents: number
  enforceDailyCap: boolean
  dailySpendCents?: number
}): ToolPolicyDecision {
  if (!params.policy.money.enabled) {
    return {
      allowed: false,
      reasonCode: 'MONEY_DISABLED',
      reason: 'Action blocked by tool policy: money actions are disabled for this ResearchAgent.',
    }
  }

  if (params.amountCents > params.policy.money.max_per_action_cents) {
    return {
      allowed: false,
      reasonCode: 'MONEY_MAX_PER_ACTION_EXCEEDED',
      reason: 'Action blocked by tool policy: amount exceeds the per-action cap.',
    }
  }

  if (params.enforceDailyCap) {
    if (params.dailySpendCents === undefined) {
      return {
        allowed: false,
        reasonCode: 'MONEY_DAILY_SPEND_UNAVAILABLE',
        reason: 'Action blocked by tool policy: unable to compute daily spend.',
      }
    }

    const nextSpend = params.dailySpendCents + params.amountCents
    if (nextSpend > params.policy.money.max_daily_cents) {
      return {
        allowed: false,
        reasonCode: 'MONEY_MAX_DAILY_EXCEEDED',
        reason: 'Action blocked by tool policy: daily spend cap would be exceeded.',
      }
    }
  }

  return { allowed: true, reasonCode: 'ALLOWED', reason: 'Allowed by tool policy.' }
}

export function evaluateExternalJobsPolicy(params: {
  policy: AgentToolPolicyV1
  provider: ExternalProvider
}): ToolPolicyDecision {
  if (!params.policy.external_jobs.enabled) {
    return {
      allowed: false,
      reasonCode: 'EXTERNAL_JOBS_DISABLED',
      reason: 'Action blocked by tool policy: external jobs are disabled for this ResearchAgent.',
    }
  }

  if (!params.policy.external_jobs.allowed_providers.includes(params.provider)) {
    return {
      allowed: false,
      reasonCode: 'EXTERNAL_PROVIDER_NOT_ALLOWED',
      reason: 'Action blocked by tool policy: provider is not allowlisted for this ResearchAgent.',
    }
  }

  return { allowed: true, reasonCode: 'ALLOWED', reason: 'Allowed by tool policy.' }
}

export async function loadAgentToolPolicy(
  supabase: any,
  agentId: string
): Promise<AgentToolPolicyV1> {
  try {
    const { data, error } = await supabase
      .from('agent_tool_policies')
      .select('schema_version, policy')
      .eq('agent_id', agentId)
      .maybeSingle()

    if (error) {
      log.warn('Failed to load tool policy; using defaults', {
        agentId,
        message: error.message,
        code: error.code,
      })
      return DEFAULT_AGENT_TOOL_POLICY
    }

    if (!data?.policy) {
      return DEFAULT_AGENT_TOOL_POLICY
    }

    const parsed = agentToolPolicyV1Schema.safeParse(data.policy)
    if (!parsed.success) {
      log.warn('Invalid tool policy row; using defaults', {
        agentId,
        schemaVersion: data.schema_version,
      })
      return DEFAULT_AGENT_TOOL_POLICY
    }

    return parsed.data
  } catch (error) {
    log.warn('Unexpected tool policy load failure; using defaults', {
      agentId,
      error: error instanceof Error ? error.message : String(error),
    })
    return DEFAULT_AGENT_TOOL_POLICY
  }
}

export async function calculateAgentDailySpendCents(
  supabase: any,
  agentId: string,
  now: Date = new Date()
): Promise<number> {
  const start = toStartOfUtcDay(now).toISOString()
  const end = toStartOfNextUtcDay(now).toISOString()

  const { data, error } = await supabase
    .from('bookings')
    .select('payer_amount, amount')
    .eq('agent_id', agentId)
    .in('escrow_status', ['funded', 'released', 'disputed'])
    .gte('created_at', start)
    .lt('created_at', end)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).reduce((sum: number, row: any) => {
    const payerAmount = Number(row?.payer_amount || 0)
    const amount = Number(row?.amount || 0)
    return sum + (payerAmount > 0 ? payerAmount : amount)
  }, 0)
}

export async function writeAgentToolAuditLogBestEffort(
  supabase: any,
  entry: {
    agentId: string
    toolName: string
    decision: 'allowed' | 'blocked'
    reasonCode?: string
    reason?: string
    amountCents?: number | null
    provider?: ExternalProvider | null
    source: ToolPolicySource
    metadata?: Record<string, unknown>
  }
) {
  try {
    await supabase.from('agent_tool_audit_log').insert({
      agent_id: entry.agentId,
      tool_name: entry.toolName,
      decision: entry.decision,
      reason_code: entry.reasonCode ?? null,
      reason: entry.reason ?? null,
      amount_cents: entry.amountCents ?? null,
      provider: entry.provider ?? null,
      source: entry.source,
      metadata: entry.metadata ?? {},
    })
  } catch (error) {
    log.warn('Failed to write tool policy audit log', {
      agentId: entry.agentId,
      toolName: entry.toolName,
      decision: entry.decision,
      source: entry.source,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
