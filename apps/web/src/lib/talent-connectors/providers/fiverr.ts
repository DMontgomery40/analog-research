import type { TalentProviderPlugin, CredentialsValidationResult } from './types'

interface FiverrCredentials {
  apiKey: string
}

export const fiverrProviderPlugin: TalentProviderPlugin<FiverrCredentials> = {
  descriptor: {
    id: 'fiverr',
    displayName: 'Fiverr',
    status: 'researching',
    description: 'Research in progress on official, policy-compliant APIs for marketplace workflows.',
    supportedEnvs: ['live'],
    capabilities: {
      test_connection: false,
      search_workers: false,
      contact_worker: false,
      create_task: false,
      sync_object: false,
    },
    credentialFields: [
      { name: 'api_key', label: 'API Key', type: 'secret', required: true, description: 'API key from Fiverr developer portal (when available)' },
    ],
    supportsColdOutreach: false,
  },

  validateCredentials(input: unknown): CredentialsValidationResult<FiverrCredentials> {
    const obj = input as Record<string, unknown> | null
    const apiKey = (obj?.api_key ?? obj?.apiKey) as string | undefined

    if (!apiKey || typeof apiKey !== 'string') {
      return { ok: false, error: 'api_key is required' }
    }

    return { ok: true, credentials: { apiKey } }
  },
}
