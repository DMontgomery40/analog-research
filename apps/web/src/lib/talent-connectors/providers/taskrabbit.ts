import type { TalentProviderPlugin, CredentialsValidationResult } from './types'

interface TaskrabbitCredentials {
  apiKey: string
}

export const taskrabbitProviderPlugin: TalentProviderPlugin<TaskrabbitCredentials> = {
  descriptor: {
    id: 'taskrabbit',
    displayName: 'Taskrabbit',
    status: 'partner_onboarding',
    description: 'Planned partner connector for on-platform task lifecycle via Partner Platform API.',
    supportedEnvs: ['sandbox', 'live'],
    capabilities: {
      test_connection: false,
      search_workers: false,
      contact_worker: false,
      create_task: false,
      sync_object: false,
    },
    credentialFields: [
      { name: 'api_key', label: 'API Key', type: 'secret', required: true, description: 'Partner API key from Taskrabbit developer portal' },
    ],
    supportsColdOutreach: false,
  },

  validateCredentials(input: unknown): CredentialsValidationResult<TaskrabbitCredentials> {
    const obj = input as Record<string, unknown> | null
    const apiKey = (obj?.api_key ?? obj?.apiKey) as string | undefined

    if (!apiKey || typeof apiKey !== 'string') {
      return { ok: false, error: 'api_key is required' }
    }

    return { ok: true, credentials: { apiKey } }
  },
}
