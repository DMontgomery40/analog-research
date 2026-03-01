import type { ExternalProvider } from '@/lib/external-jobs/types'

import { proxyPicsProviderPlugin } from './proxypics'
import { weGoLookProviderPlugin } from './wegolook'
import type { ExternalProviderPlugin } from './types'

export const EXTERNAL_PROVIDER_IDS = ['proxypics', 'wegolook'] as const

const providerPlugins: Record<ExternalProvider, ExternalProviderPlugin<unknown>> = {
  proxypics: proxyPicsProviderPlugin,
  wegolook: weGoLookProviderPlugin,
}

export function listExternalProviderPlugins(): Array<ExternalProviderPlugin<unknown>> {
  return EXTERNAL_PROVIDER_IDS.map((providerId) => providerPlugins[providerId])
}

export function listExternalProviderDescriptors() {
  return listExternalProviderPlugins().map((plugin) => plugin.descriptor)
}

export function getExternalProviderPlugin(provider: ExternalProvider): ExternalProviderPlugin<unknown> {
  return providerPlugins[provider]
}

export function isExternalProvider(value: string): value is ExternalProvider {
  return (EXTERNAL_PROVIDER_IDS as readonly string[]).includes(value)
}
