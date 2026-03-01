import { describe, expect, it } from 'vitest'

import {
  getModerationRuntimeConfig,
  MODERATION_DEFAULTS,
  updateModerationRuntimeConfig,
} from '@/lib/moderation/config'

interface QueryResult {
  data: Record<string, unknown> | null
  error: Error | null
}

class FakeConfigSupabase {
  readonly upserts: Array<Record<string, unknown>> = []

  constructor(private readonly result: QueryResult) {}

  from(_table: string) {
    return new FakeConfigQuery(this.result, this.upserts)
  }
}

class FakeConfigQuery {
  constructor(
    private readonly result: QueryResult,
    private readonly upserts: Array<Record<string, unknown>>,
  ) {}

  select(_columns: string) {
    return this
  }

  eq(_column: string, _value: unknown) {
    return this
  }

  async maybeSingle(): Promise<QueryResult> {
    return this.result
  }

  async upsert(payload: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> {
    this.upserts.push(payload)
    return { data: payload }
  }
}

describe('moderation runtime config', () => {
  it('falls back to defaults when config query errors', async () => {
    const supabase = new FakeConfigSupabase({
      data: null,
      error: new Error('db unavailable'),
    })

    const result = await getModerationRuntimeConfig(supabase as never)

    expect(result).toEqual(MODERATION_DEFAULTS)
    expect(supabase.upserts).toEqual([])
  })

  it('creates default row when no config row exists', async () => {
    const supabase = new FakeConfigSupabase({
      data: null,
      error: null,
    })

    const result = await getModerationRuntimeConfig(supabase as never)

    expect(result).toEqual(MODERATION_DEFAULTS)
    expect(supabase.upserts).toHaveLength(1)
    expect(supabase.upserts[0]).toEqual(expect.objectContaining({
      id: 1,
      provider: MODERATION_DEFAULTS.provider,
      model_primary: MODERATION_DEFAULTS.modelPrimary,
      model_escalation: MODERATION_DEFAULTS.modelEscalation,
    }))
  })

  it('merges database row into runtime config shape', async () => {
    const supabase = new FakeConfigSupabase({
      data: {
        provider: 'openrouter',
        model_primary: 'meta-llama/llama-3.3-70b-instruct',
        model_escalation: 'meta-llama/llama-guard-3-8b',
        timeout_ms: 2200,
        fail_confidence: 0.95,
        warn_confidence: 0.62,
        max_input_chars: 8000,
        daily_token_budget: 400000,
        policy_version: '2026-03-01-v2',
      },
      error: null,
    })

    const result = await getModerationRuntimeConfig(supabase as never)

    expect(result).toEqual({
      provider: 'openrouter',
      modelPrimary: 'meta-llama/llama-3.3-70b-instruct',
      modelEscalation: 'meta-llama/llama-guard-3-8b',
      timeoutMs: 2200,
      failConfidence: 0.95,
      warnConfidence: 0.62,
      maxInputChars: 8000,
      dailyTokenBudget: 400000,
      policyVersion: '2026-03-01-v2',
    })
  })

  it('updates config and persists updater identity', async () => {
    const supabase = new FakeConfigSupabase({
      data: {
        provider: 'openrouter',
        model_primary: 'mistralai/mistral-nemo',
        model_escalation: 'meta-llama/llama-guard-3-8b',
        timeout_ms: 1800,
        fail_confidence: 0.93,
        warn_confidence: 0.6,
        max_input_chars: 12000,
        daily_token_budget: 1000000,
        policy_version: '2026-02-08-v1',
      },
      error: null,
    })

    const updated = await updateModerationRuntimeConfig({
      timeoutMs: 2500,
      policyVersion: '2026-04-01-v3',
    }, 'admin@analoglabor.com', supabase as never)

    expect(updated.timeoutMs).toBe(2500)
    expect(updated.policyVersion).toBe('2026-04-01-v3')
    expect(supabase.upserts).toHaveLength(1)
    expect(supabase.upserts[0]).toEqual(expect.objectContaining({
      timeout_ms: 2500,
      policy_version: '2026-04-01-v3',
      updated_by: 'admin@analoglabor.com',
    }))
  })
})
