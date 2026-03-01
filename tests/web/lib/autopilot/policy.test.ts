import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOPILOT_POLICY,
  evaluateAutopilotPolicy,
  safeParseAutopilotPolicy,
  type AutopilotPolicy,
} from '@/lib/autopilot/policy'

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<U>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

const buildPolicy = (overrides: DeepPartial<AutopilotPolicy>): AutopilotPolicy => ({
  ...DEFAULT_AUTOPILOT_POLICY,
  ...overrides,
  caps: {
    ...DEFAULT_AUTOPILOT_POLICY.caps,
    ...overrides.caps,
  },
  payments: {
    ...DEFAULT_AUTOPILOT_POLICY.payments,
    ...overrides.payments,
  },
  approval_triggers: {
    ...DEFAULT_AUTOPILOT_POLICY.approval_triggers,
    ...overrides.approval_triggers,
    low_legitimacy_human: {
      ...DEFAULT_AUTOPILOT_POLICY.approval_triggers.low_legitimacy_human,
      ...overrides.approval_triggers?.low_legitimacy_human,
    },
    anomaly_burst_detection: {
      ...DEFAULT_AUTOPILOT_POLICY.approval_triggers.anomaly_burst_detection,
      ...overrides.approval_triggers?.anomaly_burst_detection,
    },
  },
})

const disabledApprovalPolicy = buildPolicy({
  allowed_skills: ['design'],
  approval_triggers: {
    first_booking_with_human: false,
    booking_over_amount_cents: 0,
    low_legitimacy_human: { enabled: false },
    anomaly_burst_detection: { enabled: false },
  },
})

describe('autopilot policy defaults', () => {
  it('uses fail-closed defaults', () => {
    expect(DEFAULT_AUTOPILOT_POLICY.allowed_skills).toEqual([])
    expect(DEFAULT_AUTOPILOT_POLICY.caps.max_daily_spend_cents).toBe(10000)
    expect(DEFAULT_AUTOPILOT_POLICY.payments.allow_off_session_autopay).toBe(false)
    expect(DEFAULT_AUTOPILOT_POLICY.approval_triggers.first_booking_with_human).toBe(true)
    expect(DEFAULT_AUTOPILOT_POLICY.approval_triggers.booking_over_amount_cents).toBeGreaterThan(0)
    expect(DEFAULT_AUTOPILOT_POLICY.approval_triggers.low_legitimacy_human.enabled).toBe(true)
    expect(DEFAULT_AUTOPILOT_POLICY.approval_triggers.anomaly_burst_detection.enabled).toBe(true)
  })
})

describe('autopilot policy parsing', () => {
  it('rejects unknown major versions', () => {
    const result = safeParseAutopilotPolicy({ schema_version: '2.0' })
    expect(result.ok).toBe(false)
  })

  it('accepts minor revisions within the supported major', () => {
    const result = safeParseAutopilotPolicy({ schema_version: '1.2', allowed_skills: ['design'] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.policy.schema_version).toBe('1.2')
    }
  })
})

describe('autopilot policy enforcement', () => {
  it('blocks when allowed skills are empty', () => {
    const decision = evaluateAutopilotPolicy(DEFAULT_AUTOPILOT_POLICY, {
      skill: 'design',
      amount_cents: 1000,
      daily_spend_cents: 0,
      has_prior_booking_with_human: true,
      human_legitimacy_score: 80,
      recent_action_count_last_hour: 0,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.blockedReasons).toContain('allowed_skills_empty')
  })

  it('blocks when the daily spend cap would be exceeded', () => {
    const decision = evaluateAutopilotPolicy(disabledApprovalPolicy, {
      skill: 'design',
      amount_cents: 9000,
      daily_spend_cents: 2000,
      has_prior_booking_with_human: true,
      human_legitimacy_score: 80,
      recent_action_count_last_hour: 0,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.blockedReasons).toContain('daily_spend_cap_exceeded')
  })

  it('requires approval for configured human-in-loop triggers', () => {
    const policy = buildPolicy({
      allowed_skills: ['design'],
    })

    const decision = evaluateAutopilotPolicy(policy, {
      skill: 'design',
      amount_cents: 6000,
      daily_spend_cents: 0,
      has_prior_booking_with_human: false,
      human_legitimacy_score: 40,
      recent_action_count_last_hour: 4,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.requiresApproval).toBe(true)
    expect(decision.approvalReasons).toEqual(
      expect.arrayContaining([
        'first_booking_with_human',
        'booking_over_amount',
        'low_legitimacy_human',
        'anomaly_burst_detected',
      ]),
    )
  })
})
