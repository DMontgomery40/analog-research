import { describe, expect, it } from 'vitest'

import {
  getTalentProviderPlugin,
  listTalentProviderDescriptors,
  listTalentProviderPlugins,
} from '@/lib/talent-connectors/providers/registry'
import { TALENT_PROVIDERS } from '@/lib/talent-connectors/types'

describe('talent provider registry', () => {
  it('registers all declared providers', () => {
    const descriptors = listTalentProviderDescriptors()
    const registeredIds = descriptors.map((d) => d.id)

    for (const provider of TALENT_PROVIDERS) {
      expect(registeredIds).toContain(provider)
    }
    expect(descriptors.length).toBe(TALENT_PROVIDERS.length)
  })

  it('returns plugins in TALENT_PROVIDERS order', () => {
    const plugins = listTalentProviderPlugins()
    const ids = plugins.map((p) => p.descriptor.id)
    expect(ids).toEqual([...TALENT_PROVIDERS])
  })

  it('retrieves individual plugins by provider id', () => {
    for (const provider of TALENT_PROVIDERS) {
      const plugin = getTalentProviderPlugin(provider)
      expect(plugin).toBeDefined()
      expect(plugin.descriptor.id).toBe(provider)
    }
  })

  it('enforces supportsColdOutreach: false on every descriptor', () => {
    const descriptors = listTalentProviderDescriptors()
    for (const d of descriptors) {
      expect(d.supportsColdOutreach).toBe(false)
    }
  })

  it('has valid status values on all descriptors', () => {
    const validStatuses = new Set(['active', 'partner_onboarding', 'researching'])
    const descriptors = listTalentProviderDescriptors()
    for (const d of descriptors) {
      expect(validStatuses.has(d.status)).toBe(true)
    }
  })

  it('validates credentials — rejects empty input', () => {
    for (const provider of TALENT_PROVIDERS) {
      const plugin = getTalentProviderPlugin(provider)
      const result = plugin.validateCredentials({})
      // Providers with required credential fields should reject empty input
      const hasRequiredFields = plugin.descriptor.credentialFields.some((f) => f.required)
      if (hasRequiredFields) {
        expect(result.ok, `${provider} should reject empty credentials`).toBe(false)
      }
    }
  })
})
