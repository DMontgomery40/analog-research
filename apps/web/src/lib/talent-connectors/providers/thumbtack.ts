import type { TalentProviderPlugin, CredentialsValidationResult } from './types'

interface ThumbtackCredentials {
  apiKey: string
}

export const thumbtackProviderPlugin: TalentProviderPlugin<ThumbtackCredentials> = {
  descriptor: {
    id: 'thumbtack',
    displayName: 'Thumbtack',
    status: 'partner_onboarding',
    description: 'Planned partner connector for request/negotiation workflows via Partner API + OAuth2.',
    supportedEnvs: ['sandbox', 'live'],
    capabilities: {
      test_connection: false,
      search_workers: false,
      contact_worker: false,
      create_task: false,
      sync_object: false,
    },
    credentialFields: [
      { name: 'api_key', label: 'API Key', type: 'secret', required: true, description: 'Partner API key from Thumbtack developer portal' },
    ],
    supportsColdOutreach: false,
  },

  validateCredentials(input: unknown): CredentialsValidationResult<ThumbtackCredentials> {
    const obj = input as Record<string, unknown> | null
    const apiKey = (obj?.api_key ?? obj?.apiKey) as string | undefined

    if (!apiKey || typeof apiKey !== 'string') {
      return { ok: false, error: 'api_key is required' }
    }

    return { ok: true, credentials: { apiKey } }
  },
}
