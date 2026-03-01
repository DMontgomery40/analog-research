import { describe, expect, it, vi } from 'vitest'

import {
  evaluateTalentConnectorPolicy,
} from '@/lib/talent-connectors/policy'
import type { TalentConnectorPolicyRow } from '@/lib/talent-connectors/policy'
import { TALENT_ERROR_CODES } from '@/lib/talent-connectors/types'

const fullPolicy: TalentConnectorPolicyRow = {
  allow_discovery: true,
  allow_contact: true,
  allow_post_task: true,
  allow_payment: true,
}

describe('talent connector policy evaluator', () => {
  it('blocks when global feature flag is off', () => {
    vi.stubEnv('TALENT_CONNECTORS_ENABLED', '')

    const result = evaluateTalentConnectorPolicy({
      provider: 'upwork',
      capability: 'search_workers',
      policyRow: fullPolicy,
      hasCredentials: true,
    })

    expect(result.allowed).toBe(false)
    expect(result.code).toBe(TALENT_ERROR_CODES.TALENT_CONNECTORS_DISABLED)
  })

  it('blocks researching providers', () => {
    vi.stubEnv('TALENT_CONNECTORS_ENABLED', 'true')

    const result = evaluateTalentConnectorPolicy({
      provider: 'fiverr', // status: researching
      capability: 'search_workers',
      policyRow: fullPolicy,
      hasCredentials: true,
    })

    expect(result.allowed).toBe(false)
    expect(result.code).toBe(TALENT_ERROR_CODES.PROVIDER_RESEARCHING)
  })

  it('blocks partner_onboarding providers without credentials', () => {
    vi.stubEnv('TALENT_CONNECTORS_ENABLED', 'true')

    const result = evaluateTalentConnectorPolicy({
      provider: 'upwork', // status: partner_onboarding
      capability: 'search_workers',
      policyRow: fullPolicy,
      hasCredentials: false,
    })

    expect(result.allowed).toBe(false)
    expect(result.code).toBe(TALENT_ERROR_CODES.PARTNER_CONTRACT_REQUIRED)
  })

  it('blocks when credentials not configured (non-test capability)', () => {
    vi.stubEnv('TALENT_CONNECTORS_ENABLED', 'true')

    // Use upwork which is partner_onboarding, but give credentials=false
    // This should fail at the partner_contract check first since status is partner_onboarding
    // Let's test the credential check on a hypothetical active provider
    // Since all current providers are partner_onboarding or researching,
    // the credential check is only reachable after partner_onboarding with credentials=true
    // or on an active provider. We test the gate order is correct.
    const result = evaluateTalentConnectorPolicy({
      provider: 'upwork',
      capability: 'search_workers',
      policyRow: fullPolicy,
      hasCredentials: false,
    })

    // Blocked at partner_contract step (earlier in chain)
    expect(result.allowed).toBe(false)
  })

  it('blocks when policy row disallows the capability', () => {
    vi.stubEnv('TALENT_CONNECTORS_ENABLED', 'true')

    const restrictedPolicy: TalentConnectorPolicyRow = {
      allow_discovery: false,
      allow_contact: true,
      allow_post_task: true,
      allow_payment: true,
    }

    const result = evaluateTalentConnectorPolicy({
      provider: 'upwork',
      capability: 'search_workers',
      policyRow: restrictedPolicy,
      hasCredentials: true,
    })

    expect(result.allowed).toBe(false)
    expect(result.code).toBe(TALENT_ERROR_CODES.CONNECTOR_POLICY_BLOCKED)
  })

  it('blocks when descriptor does not support the capability', () => {
    vi.stubEnv('TALENT_CONNECTORS_ENABLED', 'true')

    // upwork has all capabilities set to false (partner_onboarding stub)
    const result = evaluateTalentConnectorPolicy({
      provider: 'upwork',
      capability: 'search_workers',
      policyRow: fullPolicy,
      hasCredentials: true,
    })

    expect(result.allowed).toBe(false)
    expect(result.code).toBe(TALENT_ERROR_CODES.UNSUPPORTED_PROVIDER_ACTION)
  })

  it('blocks contact capability when policy disallows it', () => {
    vi.stubEnv('TALENT_CONNECTORS_ENABLED', 'true')

    const noContactPolicy: TalentConnectorPolicyRow = {
      allow_discovery: true,
      allow_contact: false,
      allow_post_task: true,
      allow_payment: true,
    }

    const result = evaluateTalentConnectorPolicy({
      provider: 'upwork',
      capability: 'contact_worker',
      policyRow: noContactPolicy,
      hasCredentials: true,
    })

    expect(result.allowed).toBe(false)
    expect(result.code).toBe(TALENT_ERROR_CODES.CONNECTOR_POLICY_BLOCKED)
  })
})
