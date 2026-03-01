import type { TalentProvider, TalentErrorCode } from '@/lib/talent-connectors/types'
import { TALENT_ERROR_CODES } from '@/lib/talent-connectors/types'
import { getTalentProviderPlugin } from '@/lib/talent-connectors/providers/registry'
import type { TalentProviderCapability } from '@/lib/talent-connectors/providers/types'

// ---------------------------------------------------------------------------
// Policy decision
// ---------------------------------------------------------------------------

export interface PolicyDecision {
  allowed: boolean
  code: TalentErrorCode | null
  reason: string
}

const ALLOWED: PolicyDecision = { allowed: true, code: null, reason: '' }

function blocked(code: TalentErrorCode, reason: string): PolicyDecision {
  return { allowed: false, code, reason }
}

// ---------------------------------------------------------------------------
// Policy row shape (matches DB talent_connector_policies)
// ---------------------------------------------------------------------------

export interface TalentConnectorPolicyRow {
  allow_discovery: boolean
  allow_contact: boolean
  allow_post_task: boolean
  allow_payment: boolean
}

// ---------------------------------------------------------------------------
// Capability → policy flag mapping
// ---------------------------------------------------------------------------

const CAPABILITY_TO_POLICY_FLAG: Partial<Record<TalentProviderCapability, keyof TalentConnectorPolicyRow>> = {
  search_workers: 'allow_discovery',
  contact_worker: 'allow_contact',
  create_task: 'allow_post_task',
}

// ---------------------------------------------------------------------------
// Evaluate
// ---------------------------------------------------------------------------

/**
 * Computes whether a talent connector action is permitted.
 *
 * Check order:
 *  1. Global kill switch (TALENT_CONNECTORS_ENABLED)
 *  2. Provider known
 *  3. Provider researching
 *  4. Partner contract required (partner_onboarding + no credentials)
 *  5. Credentials configured
 *  6. Policy row flags
 *  7. Descriptor capability enabled
 *  8. Plugin method exists
 */
export function evaluateTalentConnectorPolicy(params: {
  provider: TalentProvider
  capability: TalentProviderCapability
  policyRow: TalentConnectorPolicyRow | null
  hasCredentials: boolean
}): PolicyDecision {
  // 1. Global kill switch
  if (process.env.TALENT_CONNECTORS_ENABLED !== 'true') {
    return blocked(TALENT_ERROR_CODES.TALENT_CONNECTORS_DISABLED, 'Talent connectors are disabled')
  }

  const plugin = getTalentProviderPlugin(params.provider)
  const descriptor = plugin.descriptor

  // 3. Provider researching
  if (descriptor.status === 'researching') {
    return blocked(TALENT_ERROR_CODES.PROVIDER_RESEARCHING, `${descriptor.displayName} is still in research phase`)
  }

  // 4. Partner contract (partner_onboarding without credentials = not yet approved)
  if (descriptor.status === 'partner_onboarding' && !params.hasCredentials) {
    return blocked(TALENT_ERROR_CODES.PARTNER_CONTRACT_REQUIRED, `${descriptor.displayName} requires partner contract approval`)
  }

  // 5. Credentials
  if (!params.hasCredentials && params.capability !== 'test_connection') {
    return blocked(TALENT_ERROR_CODES.CREDENTIALS_NOT_CONFIGURED, `No credentials configured for ${descriptor.displayName}`)
  }

  // 6. Policy row flags
  const policyFlag = CAPABILITY_TO_POLICY_FLAG[params.capability]
  if (policyFlag && params.policyRow && !params.policyRow[policyFlag]) {
    return blocked(TALENT_ERROR_CODES.CONNECTOR_POLICY_BLOCKED, `Policy disallows ${params.capability} for ${descriptor.displayName}`)
  }

  // 7. Descriptor capability
  if (!descriptor.capabilities[params.capability]) {
    return blocked(TALENT_ERROR_CODES.UNSUPPORTED_PROVIDER_ACTION, `${descriptor.displayName} does not support ${params.capability}`)
  }

  return ALLOWED
}
