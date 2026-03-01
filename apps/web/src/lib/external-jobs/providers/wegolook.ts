import type { ExternalProviderPlugin } from './types'

interface WeGoLookCredentials {
  apiKey: string
}

export const weGoLookProviderPlugin: ExternalProviderPlugin<WeGoLookCredentials> = {
  descriptor: {
    id: 'wegolook',
    displayName: 'WeGoLook',
    status: 'planned',
    description: 'Provider scaffold only. Runtime operations are disabled until API contract is onboarded.',
    supportedEnvs: ['live', 'sandbox'],
    capabilities: {
      test_connection: false,
      create_field_check: false,
      refresh_field_check: false,
      cancel_field_check: false,
      approve_field_check: false,
      reject_field_check: false,
      send_field_check_message: false,
      list_templates: false,
    },
    credentialFields: [
      {
        name: 'api_key',
        label: 'API key',
        type: 'secret',
        required: true,
        description: 'Reserved for upcoming WeGoLook integration.',
      },
    ],
  },

  validateCredentials(input: unknown) {
    if (!input || typeof input !== 'object') {
      return { ok: false as const, error: 'Missing credentials object' }
    }

    const rawApiKey = (input as { apiKey?: unknown; api_key?: unknown }).apiKey
      ?? (input as { apiKey?: unknown; api_key?: unknown }).api_key
    if (typeof rawApiKey !== 'string' || rawApiKey.trim().length === 0) {
      return { ok: false as const, error: 'Invalid WeGoLook credentials: missing apiKey' }
    }

    return {
      ok: true as const,
      credentials: { apiKey: rawApiKey.trim() },
    }
  },
}
