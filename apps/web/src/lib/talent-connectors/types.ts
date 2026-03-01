import type { ExternalProviderEnv } from '@/lib/external-jobs/types'

// ---------------------------------------------------------------------------
// Talent providers (subset of external_provider enum used for talent networks)
// ---------------------------------------------------------------------------

export const TALENT_PROVIDERS = ['upwork', 'thumbtack', 'taskrabbit', 'fiverr'] as const
export type TalentProvider = (typeof TALENT_PROVIDERS)[number]

export function isTalentProvider(value: string): value is TalentProvider {
  return (TALENT_PROVIDERS as readonly string[]).includes(value)
}

// Re-export env type — talent connectors share the same live/sandbox model
export type { ExternalProviderEnv as TalentProviderEnv }

// ---------------------------------------------------------------------------
// Match statuses (mirrors DB enum talent_connector_match_status)
// ---------------------------------------------------------------------------

export const TALENT_MATCH_STATUSES = [
  'pending',
  'contacted',
  'accepted',
  'rejected',
  'expired',
] as const
export type TalentMatchStatus = (typeof TALENT_MATCH_STATUSES)[number]

// ---------------------------------------------------------------------------
// Action types (mirrors DB enum talent_connector_action_type)
// ---------------------------------------------------------------------------

export const TALENT_ACTION_TYPES = ['contact', 'post_task', 'sync'] as const
export type TalentActionType = (typeof TALENT_ACTION_TYPES)[number]

// ---------------------------------------------------------------------------
// Action statuses (mirrors DB enum talent_connector_action_status)
// ---------------------------------------------------------------------------

export const TALENT_ACTION_STATUSES = ['pending', 'success', 'failed'] as const
export type TalentActionStatus = (typeof TALENT_ACTION_STATUSES)[number]

// ---------------------------------------------------------------------------
// Availability shape (standardized per plan: ISO weekday 1-7, HH:mm)
// ---------------------------------------------------------------------------

export interface AvailabilityWindow {
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7
  start: string // HH:mm
  end: string   // HH:mm
}

export interface WorkerAvailability {
  timezone: string  // IANA timezone
  windows: AvailabilityWindow[]
  as_of: string     // ISO-8601
  notes?: string
}

// ---------------------------------------------------------------------------
// Stable error codes (contract with API consumers)
// ---------------------------------------------------------------------------

export const TALENT_ERROR_CODES = {
  TALENT_CONNECTORS_DISABLED: 'TALENT_CONNECTORS_DISABLED',
  TALENT_PROVIDER_UNKNOWN: 'TALENT_PROVIDER_UNKNOWN',
  PROVIDER_RESEARCHING: 'PROVIDER_RESEARCHING',
  PARTNER_CONTRACT_REQUIRED: 'PARTNER_CONTRACT_REQUIRED',
  CONNECTOR_POLICY_BLOCKED: 'CONNECTOR_POLICY_BLOCKED',
  CREDENTIALS_NOT_CONFIGURED: 'CREDENTIALS_NOT_CONFIGURED',
  UNSUPPORTED_PROVIDER_ACTION: 'UNSUPPORTED_PROVIDER_ACTION',
  TALENT_IDEMPOTENCY_CONFLICT: 'TALENT_IDEMPOTENCY_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
} as const

export type TalentErrorCode = (typeof TALENT_ERROR_CODES)[keyof typeof TALENT_ERROR_CODES]
