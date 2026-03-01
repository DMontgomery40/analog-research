export const AUTOPILOT_POLICY_MAJOR_VERSION = 1
export const AUTOPILOT_POLICY_SCHEMA_VERSION = '1.0'

export type AutopilotPolicy = {
  schema_version: string
  allowed_skills: string[]
  caps: {
    max_daily_spend_cents: number
  }
  payments: {
    allow_off_session_autopay: boolean
  }
  approval_triggers: {
    first_booking_with_human: boolean
    booking_over_amount_cents: number
    low_legitimacy_human: {
      enabled: boolean
      min_human_legitimacy_score: number
    }
    anomaly_burst_detection: {
      enabled: boolean
      max_actions_per_hour: number
    }
  }
}

export type AutopilotPolicyBlockReason =
  | 'allowed_skills_empty'
  | 'missing_skill'
  | 'skill_not_allowed'
  | 'missing_amount'
  | 'missing_daily_spend'
  | 'daily_spend_cap_exceeded'
  | 'off_session_autopay_disabled'

export type AutopilotPolicyApprovalReason =
  | 'first_booking_with_human'
  | 'booking_over_amount'
  | 'booking_amount_unknown'
  | 'low_legitimacy_human'
  | 'human_legitimacy_unknown'
  | 'anomaly_burst_detected'
  | 'burst_context_missing'

export type AutopilotPolicyDecision = {
  allowed: boolean
  requiresApproval: boolean
  blockedReasons: AutopilotPolicyBlockReason[]
  approvalReasons: AutopilotPolicyApprovalReason[]
}

export type AutopilotPolicyContext = {
  skill?: string | null
  amount_cents?: number | null
  daily_spend_cents?: number | null
  requires_off_session_autopay?: boolean
  has_prior_booking_with_human?: boolean | null
  human_legitimacy_score?: number | null
  recent_action_count_last_hour?: number | null
}

export const AUTOPILOT_POLICY_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Analog Research ResearchAgent Autopilot Policy',
  type: 'object',
  additionalProperties: true,
  required: ['schema_version', 'allowed_skills', 'caps', 'payments', 'approval_triggers'],
  properties: {
    schema_version: { type: 'string' },
    allowed_skills: {
      type: 'array',
      items: { type: 'string' },
    },
    caps: {
      type: 'object',
      additionalProperties: true,
      required: ['max_daily_spend_cents'],
      properties: {
        max_daily_spend_cents: { type: 'number', minimum: 0 },
      },
    },
    payments: {
      type: 'object',
      additionalProperties: true,
      required: ['allow_off_session_autopay'],
      properties: {
        allow_off_session_autopay: { type: 'boolean' },
      },
    },
    approval_triggers: {
      type: 'object',
      additionalProperties: true,
      required: [
        'first_booking_with_human',
        'booking_over_amount_cents',
        'low_legitimacy_human',
        'anomaly_burst_detection',
      ],
      properties: {
        first_booking_with_human: { type: 'boolean' },
        booking_over_amount_cents: { type: 'number', minimum: 0 },
        low_legitimacy_human: {
          type: 'object',
          additionalProperties: true,
          required: ['enabled', 'min_human_legitimacy_score'],
          properties: {
            enabled: { type: 'boolean' },
            min_human_legitimacy_score: { type: 'number', minimum: 0, maximum: 100 },
          },
        },
        anomaly_burst_detection: {
          type: 'object',
          additionalProperties: true,
          required: ['enabled', 'max_actions_per_hour'],
          properties: {
            enabled: { type: 'boolean' },
            max_actions_per_hour: { type: 'number', minimum: 1 },
          },
        },
      },
    },
  },
} as const

export const DEFAULT_AUTOPILOT_POLICY: AutopilotPolicy = {
  schema_version: AUTOPILOT_POLICY_SCHEMA_VERSION,
  allowed_skills: [],
  caps: {
    max_daily_spend_cents: 10000,
  },
  payments: {
    allow_off_session_autopay: false,
  },
  approval_triggers: {
    first_booking_with_human: true,
    booking_over_amount_cents: 5000,
    low_legitimacy_human: {
      enabled: true,
      min_human_legitimacy_score: 60,
    },
    anomaly_burst_detection: {
      enabled: true,
      max_actions_per_hour: 3,
    },
  },
}

export type AutopilotPolicyParseResult =
  | { ok: true; policy: AutopilotPolicy }
  | { ok: false; error: string }

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const asStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null
  const filtered = value.filter((item) => typeof item === 'string' && item.trim().length > 0) as string[]
  return filtered.length === value.length ? filtered : null
}

const asBoolean = (value: unknown): boolean | null => {
  if (typeof value !== 'boolean') return null
  return value
}

const asNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return value
}

const parseMajorVersion = (version: string): number | null => {
  const match = version.trim().match(/^(\d+)(?:\.|$)/)
  if (!match) return null
  return Number(match[1])
}

export const safeParseAutopilotPolicy = (input: unknown): AutopilotPolicyParseResult => {
  if (!isRecord(input)) {
    return { ok: false, error: 'Policy must be an object.' }
  }

  const rawVersion = typeof input.schema_version === 'string' ? input.schema_version : ''
  if (!rawVersion) {
    return { ok: false, error: 'schema_version is required.' }
  }

  const major = parseMajorVersion(rawVersion)
  if (major !== AUTOPILOT_POLICY_MAJOR_VERSION) {
    return { ok: false, error: `Unsupported policy major version: ${rawVersion}` }
  }

  const allowedSkills = asStringArray(input.allowed_skills) ?? DEFAULT_AUTOPILOT_POLICY.allowed_skills
  const capsValue = isRecord(input.caps) ? input.caps : {}
  const paymentsValue = isRecord(input.payments) ? input.payments : {}
  const triggersValue = isRecord(input.approval_triggers) ? input.approval_triggers : {}
  const lowLegitimacyValue = isRecord(triggersValue.low_legitimacy_human) ? triggersValue.low_legitimacy_human : {}
  const anomalyValue = isRecord(triggersValue.anomaly_burst_detection) ? triggersValue.anomaly_burst_detection : {}

  const maxDailySpend = asNumber(capsValue.max_daily_spend_cents)
  const bookingOverAmount = asNumber(triggersValue.booking_over_amount_cents)
  const minLegitimacyScore = asNumber(lowLegitimacyValue.min_human_legitimacy_score)
  const maxActionsPerHour = asNumber(anomalyValue.max_actions_per_hour)

  const policy: AutopilotPolicy = {
    schema_version: rawVersion,
    allowed_skills: allowedSkills,
    caps: {
      max_daily_spend_cents:
        maxDailySpend !== null && maxDailySpend >= 0
          ? maxDailySpend
          : DEFAULT_AUTOPILOT_POLICY.caps.max_daily_spend_cents,
    },
    payments: {
      allow_off_session_autopay:
        asBoolean(paymentsValue.allow_off_session_autopay) ??
        DEFAULT_AUTOPILOT_POLICY.payments.allow_off_session_autopay,
    },
    approval_triggers: {
      first_booking_with_human:
        asBoolean(triggersValue.first_booking_with_human) ??
        DEFAULT_AUTOPILOT_POLICY.approval_triggers.first_booking_with_human,
      booking_over_amount_cents:
        bookingOverAmount !== null && bookingOverAmount >= 0
          ? bookingOverAmount
          : DEFAULT_AUTOPILOT_POLICY.approval_triggers.booking_over_amount_cents,
      low_legitimacy_human: {
        enabled:
          asBoolean(lowLegitimacyValue.enabled) ??
          DEFAULT_AUTOPILOT_POLICY.approval_triggers.low_legitimacy_human.enabled,
        min_human_legitimacy_score:
          minLegitimacyScore !== null && minLegitimacyScore >= 0
            ? minLegitimacyScore
            : DEFAULT_AUTOPILOT_POLICY.approval_triggers.low_legitimacy_human.min_human_legitimacy_score,
      },
      anomaly_burst_detection: {
        enabled:
          asBoolean(anomalyValue.enabled) ??
          DEFAULT_AUTOPILOT_POLICY.approval_triggers.anomaly_burst_detection.enabled,
        max_actions_per_hour:
          maxActionsPerHour !== null && maxActionsPerHour >= 1
            ? maxActionsPerHour
            : DEFAULT_AUTOPILOT_POLICY.approval_triggers.anomaly_burst_detection.max_actions_per_hour,
      },
    },
  }

  return { ok: true, policy }
}

export const parseAutopilotPolicy = (input: unknown): AutopilotPolicy => {
  const result = safeParseAutopilotPolicy(input)
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.policy
}

export const coerceAutopilotPolicy = (input: unknown): AutopilotPolicy => {
  const result = safeParseAutopilotPolicy(input)
  return result.ok ? result.policy : DEFAULT_AUTOPILOT_POLICY
}

export const evaluateAutopilotPolicy = (
  policy: AutopilotPolicy,
  context: AutopilotPolicyContext,
): AutopilotPolicyDecision => {
  const blockedReasons: AutopilotPolicyBlockReason[] = []
  const approvalReasons: AutopilotPolicyApprovalReason[] = []

  if (policy.allowed_skills.length === 0) {
    blockedReasons.push('allowed_skills_empty')
  } else if (!context.skill || context.skill.trim().length === 0) {
    blockedReasons.push('missing_skill')
  } else if (!policy.allowed_skills.includes(context.skill)) {
    blockedReasons.push('skill_not_allowed')
  }

  if (context.amount_cents == null) {
    blockedReasons.push('missing_amount')
  }

  if (context.daily_spend_cents == null) {
    blockedReasons.push('missing_daily_spend')
  }

  if (
    context.amount_cents != null &&
    context.daily_spend_cents != null &&
    context.daily_spend_cents + context.amount_cents > policy.caps.max_daily_spend_cents
  ) {
    blockedReasons.push('daily_spend_cap_exceeded')
  }

  if (context.requires_off_session_autopay && !policy.payments.allow_off_session_autopay) {
    blockedReasons.push('off_session_autopay_disabled')
  }

  if (policy.approval_triggers.first_booking_with_human && context.has_prior_booking_with_human !== true) {
    approvalReasons.push('first_booking_with_human')
  }

  if (policy.approval_triggers.booking_over_amount_cents > 0) {
    if (context.amount_cents == null) {
      approvalReasons.push('booking_amount_unknown')
    } else if (context.amount_cents >= policy.approval_triggers.booking_over_amount_cents) {
      approvalReasons.push('booking_over_amount')
    }
  }

  if (policy.approval_triggers.low_legitimacy_human.enabled) {
    if (context.human_legitimacy_score == null) {
      approvalReasons.push('human_legitimacy_unknown')
    } else if (context.human_legitimacy_score < policy.approval_triggers.low_legitimacy_human.min_human_legitimacy_score) {
      approvalReasons.push('low_legitimacy_human')
    }
  }

  if (policy.approval_triggers.anomaly_burst_detection.enabled) {
    if (context.recent_action_count_last_hour == null) {
      approvalReasons.push('burst_context_missing')
    } else if (
      context.recent_action_count_last_hour >=
      policy.approval_triggers.anomaly_burst_detection.max_actions_per_hour
    ) {
      approvalReasons.push('anomaly_burst_detected')
    }
  }

  return {
    allowed: blockedReasons.length === 0,
    requiresApproval: approvalReasons.length > 0,
    blockedReasons,
    approvalReasons,
  }
}
