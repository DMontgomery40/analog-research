import { describe, expect, it } from 'vitest'

import { callOpenRouterModeration } from '@/lib/moderation/openrouter-client'

const LIVE_MODEL = (process.env.MODERATION_MODEL_PRIMARY || 'mistralai/mistral-nemo').trim() || 'mistralai/mistral-nemo'
const POLICY_VERSION = (process.env.MODERATION_POLICY_VERSION || '2026-02-08-v1').trim() || '2026-02-08-v1'
const hasOpenRouterKey = (process.env.OPENROUTER_API_KEY || '').trim().length > 0
const integrationIt = process.env.RUN_INTEGRATION_TESTS === 'true' && hasOpenRouterKey ? it : it.skip

describe('openrouter client (live provider invariants)', () => {
  integrationIt('returns a JSON-schema moderation result for benign content', async () => {
    const result = await callOpenRouterModeration({
      model: LIVE_MODEL,
      timeoutMs: 15_000,
      content: 'I need help moving furniture from a second-floor apartment. No money upfront.',
      policyVersion: POLICY_VERSION,
    })

    expect(result.meta.http_status).toBe(200)
    expect(result.meta.duration_ms).toBeGreaterThan(0)

    expect(['allow', 'warn', 'fail']).toContain(result.output.decision_suggestion)
    expect(Array.isArray(result.output.reason_codes)).toBe(true)
    expect(result.output.risk_score).toBeGreaterThanOrEqual(0)
    expect(result.output.risk_score).toBeLessThanOrEqual(1)
    expect(result.output.confidence).toBeGreaterThanOrEqual(0)
    expect(result.output.confidence).toBeLessThanOrEqual(1)
    expect(result.output.spam_score).toBeGreaterThanOrEqual(0)
    expect(result.output.spam_score).toBeLessThanOrEqual(1)
    expect(typeof result.output.needs_escalation).toBe('boolean')
    expect(typeof result.output.summary).toBe('string')
    expect(result.output.summary.length).toBeGreaterThan(0)
    expect(result.output.summary.length).toBeLessThanOrEqual(280)
  }, 20_000)
})
