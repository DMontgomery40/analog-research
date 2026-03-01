import { describe, expect, it } from 'vitest'

import { listExternalProviderDescriptors } from '@/lib/external-jobs/providers/registry'
import {
  getProviderEnvStatus,
  listAvailableFieldCheckProviders,
  resolveFieldCheckProviderSelection,
  type ExternalProviderCatalogEntry,
} from '@/lib/external-jobs/provider-ui'

function buildCatalogEntry(params: {
  id: 'proxypics' | 'wegolook'
  liveConfigured: boolean
  sandboxConfigured: boolean
}): ExternalProviderCatalogEntry {
  const descriptor = listExternalProviderDescriptors().find((row) => row.id === params.id)
  if (!descriptor) {
    throw new Error(`Missing descriptor for ${params.id}`)
  }

  return {
    ...descriptor,
    configured_envs: [
      {
        env: 'live',
        configured: params.liveConfigured,
        credentials_mask: params.liveConfigured ? '***live***' : null,
        updated_at: params.liveConfigured ? '2026-02-11T00:00:00.000Z' : null,
      },
      {
        env: 'sandbox',
        configured: params.sandboxConfigured,
        credentials_mask: params.sandboxConfigured ? '***sandbox***' : null,
        updated_at: params.sandboxConfigured ? '2026-02-11T00:00:00.000Z' : null,
      },
    ],
  }
}

describe('external job provider UI helpers', () => {
  it('filters to configured active providers that support field checks in the selected env', () => {
    const catalog: ExternalProviderCatalogEntry[] = [
      buildCatalogEntry({ id: 'proxypics', liveConfigured: true, sandboxConfigured: false }),
      buildCatalogEntry({ id: 'wegolook', liveConfigured: true, sandboxConfigured: true }),
    ]

    const liveProviders = listAvailableFieldCheckProviders(catalog, 'live')
    const sandboxProviders = listAvailableFieldCheckProviders(catalog, 'sandbox')

    expect(liveProviders.map((provider) => provider.id)).toEqual(['proxypics'])
    expect(sandboxProviders).toHaveLength(0)
  })

  it('preserves selected provider when still available', () => {
    const catalog: ExternalProviderCatalogEntry[] = [
      buildCatalogEntry({ id: 'proxypics', liveConfigured: true, sandboxConfigured: true }),
      buildCatalogEntry({ id: 'wegolook', liveConfigured: true, sandboxConfigured: true }),
    ]

    const selected = resolveFieldCheckProviderSelection({
      providerCatalog: catalog,
      providerEnv: 'live',
      selectedProviderId: 'proxypics',
    })

    expect(selected).toBe('proxypics')
  })

  it('falls back to the first available provider when selection is invalid', () => {
    const catalog: ExternalProviderCatalogEntry[] = [
      buildCatalogEntry({ id: 'proxypics', liveConfigured: true, sandboxConfigured: true }),
      buildCatalogEntry({ id: 'wegolook', liveConfigured: true, sandboxConfigured: true }),
    ]

    const selected = resolveFieldCheckProviderSelection({
      providerCatalog: catalog,
      providerEnv: 'live',
      selectedProviderId: 'invalid-provider',
    })

    expect(selected).toBe('proxypics')
  })

  it('returns empty selection when no provider is available', () => {
    const catalog: ExternalProviderCatalogEntry[] = [
      buildCatalogEntry({ id: 'proxypics', liveConfigured: false, sandboxConfigured: false }),
      buildCatalogEntry({ id: 'wegolook', liveConfigured: false, sandboxConfigured: false }),
    ]

    const selected = resolveFieldCheckProviderSelection({
      providerCatalog: catalog,
      providerEnv: 'live',
      selectedProviderId: 'proxypics',
    })

    expect(selected).toBe('')
  })

  it('returns a non-configured fallback status when env data is missing', () => {
    const descriptor = listExternalProviderDescriptors().find((row) => row.id === 'proxypics')
    if (!descriptor) {
      throw new Error('Missing descriptor for proxypics')
    }

    const status = getProviderEnvStatus({
      ...descriptor,
      configured_envs: [],
    }, 'live')

    expect(status).toEqual({
      env: 'live',
      configured: false,
      credentials_mask: null,
      updated_at: null,
    })
  })
})
