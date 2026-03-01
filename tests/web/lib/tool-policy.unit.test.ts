import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AGENT_TOOL_POLICY,
  evaluateExternalJobsPolicy,
  evaluateMoneyPolicy,
} from '@/lib/tool-policy'

describe('tool policy evaluation (unit)', () => {
  it('blocks money actions when disabled', () => {
    const decision = evaluateMoneyPolicy({
      policy: {
        ...DEFAULT_AGENT_TOOL_POLICY,
        money: { ...DEFAULT_AGENT_TOOL_POLICY.money, enabled: false },
      },
      amountCents: 100,
      enforceDailyCap: false,
    })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('MONEY_DISABLED')
    }
  })

  it('blocks money actions above the per-action cap', () => {
    const decision = evaluateMoneyPolicy({
      policy: DEFAULT_AGENT_TOOL_POLICY,
      amountCents: DEFAULT_AGENT_TOOL_POLICY.money.max_per_action_cents + 1,
      enforceDailyCap: false,
    })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('MONEY_MAX_PER_ACTION_EXCEEDED')
    }
  })

  it('blocks fund_escrow when daily spend cannot be computed', () => {
    const decision = evaluateMoneyPolicy({
      policy: DEFAULT_AGENT_TOOL_POLICY,
      amountCents: 100,
      enforceDailyCap: true,
    })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('MONEY_DAILY_SPEND_UNAVAILABLE')
    }
  })

  it('blocks money actions that would exceed the daily cap', () => {
    const decision = evaluateMoneyPolicy({
      policy: DEFAULT_AGENT_TOOL_POLICY,
      amountCents: 2000,
      enforceDailyCap: true,
      dailySpendCents: DEFAULT_AGENT_TOOL_POLICY.money.max_daily_cents - 1000,
    })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('MONEY_MAX_DAILY_EXCEEDED')
    }
  })

  it('blocks external jobs when disabled', () => {
    const decision = evaluateExternalJobsPolicy({
      policy: DEFAULT_AGENT_TOOL_POLICY,
      provider: 'proxypics',
    })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('EXTERNAL_JOBS_DISABLED')
    }
  })

  it('blocks external jobs when provider is not allowlisted', () => {
    const decision = evaluateExternalJobsPolicy({
      policy: {
        ...DEFAULT_AGENT_TOOL_POLICY,
        external_jobs: { enabled: true, allowed_providers: [] },
      },
      provider: 'proxypics',
    })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('EXTERNAL_PROVIDER_NOT_ALLOWED')
    }
  })

  it('allows external jobs when enabled and provider is allowlisted', () => {
    const decision = evaluateExternalJobsPolicy({
      policy: {
        ...DEFAULT_AGENT_TOOL_POLICY,
        external_jobs: { enabled: true, allowed_providers: ['proxypics'] },
      },
      provider: 'proxypics',
    })

    expect(decision.allowed).toBe(true)
  })
})

