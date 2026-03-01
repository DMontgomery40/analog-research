import type { TalentProviderPlugin, CredentialsValidationResult } from './types'

interface UpworkCredentials {
  clientId: string
  clientSecret: string
}

export const upworkProviderPlugin: TalentProviderPlugin<UpworkCredentials> = {
  descriptor: {
    id: 'upwork',
    displayName: 'Upwork',
    status: 'partner_onboarding',
    description: 'Planned connector for opt-in freelance talent via GraphQL + OAuth2 partner approval path.',
    supportedEnvs: ['sandbox', 'live'],
    capabilities: {
      test_connection: false,
      search_workers: false,
      contact_worker: false,
      create_task: false,
      sync_object: false,
    },
    credentialFields: [
      { name: 'client_id', label: 'Client ID', type: 'text', required: true, description: 'OAuth2 client ID from Upwork developer portal' },
      { name: 'client_secret', label: 'Client Secret', type: 'secret', required: true, description: 'OAuth2 client secret' },
    ],
    supportsColdOutreach: false,
  },

  validateCredentials(input: unknown): CredentialsValidationResult<UpworkCredentials> {
    const obj = input as Record<string, unknown> | null
    const clientId = (obj?.client_id ?? obj?.clientId) as string | undefined
    const clientSecret = (obj?.client_secret ?? obj?.clientSecret) as string | undefined

    if (!clientId || typeof clientId !== 'string') {
      return { ok: false, error: 'client_id is required' }
    }
    if (!clientSecret || typeof clientSecret !== 'string') {
      return { ok: false, error: 'client_secret is required' }
    }

    return { ok: true, credentials: { clientId, clientSecret } }
  },
}
