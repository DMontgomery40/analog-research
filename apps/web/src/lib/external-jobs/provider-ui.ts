import type { ExternalProviderDescriptor } from '@/lib/external-jobs/providers/types'

export interface ExternalProviderConfiguredEnvStatus {
  env: 'live' | 'sandbox'
  configured: boolean
  credentials_mask: string | null
  updated_at: string | null
}

export interface ExternalProviderCatalogEntry extends ExternalProviderDescriptor {
  configured_envs: ExternalProviderConfiguredEnvStatus[]
}

export function getProviderEnvStatus(
  provider: ExternalProviderCatalogEntry,
  env: 'live' | 'sandbox'
): ExternalProviderConfiguredEnvStatus {
  const configuredEnv = provider.configured_envs.find((row) => row.env === env)
  if (configuredEnv) return configuredEnv

  return {
    env,
    configured: false,
    credentials_mask: null,
    updated_at: null,
  }
}

export function listAvailableFieldCheckProviders(
  providerCatalog: ExternalProviderCatalogEntry[],
  env: 'live' | 'sandbox'
): ExternalProviderCatalogEntry[] {
  return providerCatalog.filter((provider) => {
    if (provider.status !== 'active') return false
    if (!provider.capabilities.create_field_check) return false
    if (!provider.supportedEnvs.includes(env)) return false
    return getProviderEnvStatus(provider, env).configured
  })
}

export function resolveFieldCheckProviderSelection(params: {
  providerCatalog: ExternalProviderCatalogEntry[]
  providerEnv: 'live' | 'sandbox'
  selectedProviderId: string
}): string {
  const availableProviders = listAvailableFieldCheckProviders(params.providerCatalog, params.providerEnv)
  if (availableProviders.length === 0) return ''

  const hasSelected = availableProviders.some((provider) => provider.id === params.selectedProviderId)
  if (hasSelected) return params.selectedProviderId

  return availableProviders[0].id
}
