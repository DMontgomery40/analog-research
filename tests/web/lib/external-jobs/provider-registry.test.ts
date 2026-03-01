import { describe, expect, it } from 'vitest'

import {
  getExternalProviderPlugin,
  listExternalProviderDescriptors,
} from '@/lib/external-jobs/providers/registry'

describe('external provider registry', () => {
  it('includes active and planned providers', () => {
    const descriptors = listExternalProviderDescriptors()

    const proxyPics = descriptors.find((row) => row.id === 'proxypics')
    const weGoLook = descriptors.find((row) => row.id === 'wegolook')

    expect(proxyPics).toBeDefined()
    expect(proxyPics?.status).toBe('active')
    expect(proxyPics?.capabilities.create_field_check).toBe(true)

    expect(weGoLook).toBeDefined()
    expect(weGoLook?.status).toBe('planned')
    expect(weGoLook?.capabilities.create_field_check).toBe(false)
  })

  it('validates provider credentials with plugin-specific rules', () => {
    const proxyPicsPlugin = getExternalProviderPlugin('proxypics')
    const validCamel = proxyPicsPlugin.validateCredentials({ apiKey: 'pk_test_123' })
    const validSnake = proxyPicsPlugin.validateCredentials({ api_key: 'pk_test_123' })
    const invalid = proxyPicsPlugin.validateCredentials({})

    expect(validCamel.ok).toBe(true)
    expect(validSnake.ok).toBe(true)
    expect(invalid.ok).toBe(false)
  })
})
