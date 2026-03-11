import { beforeEach, describe, expect, it } from 'vitest'

import { encryptIntegrationCredentials } from '@/lib/integrations-secrets'
import { verifyProviderConnection } from '@/lib/integrations/verify-provider'

function createServiceClient(result: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => result,
      }

      return chain
    },
  }
}

describe('verifyProviderConnection', () => {
  beforeEach(() => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64')
  })

  it('returns an operator hint for integration lookup failures', async () => {
    const result = await verifyProviderConnection({
      serviceClient: createServiceClient({
        data: null,
        error: { message: 'lookup failed' },
      }),
      actingAgentId: 'agent_123',
      provider: 'proxypics',
      env: 'live',
    })

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'lookup failed',
      operatorHint:
        'verifyProviderConnection -> external_integrations maybeSingle for actingAgentId/provider/env',
    })
  })

  it('returns an operator hint when stored credentials cannot be decrypted', async () => {
    const result = await verifyProviderConnection({
      serviceClient: createServiceClient({
        data: { credentials_encrypted: 'not-a-valid-secret' },
        error: null,
      }),
      actingAgentId: 'agent_123',
      provider: 'proxypics',
      env: 'live',
    })

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'Stored integration credentials for proxypics could not be decrypted',
      operatorHint:
        'verifyProviderConnection -> decryptIntegrationCredentials could not decode stored credentials',
    })
  })

  it('returns an operator hint when decrypted credentials fail provider validation', async () => {
    const result = await verifyProviderConnection({
      serviceClient: createServiceClient({
        data: { credentials_encrypted: encryptIntegrationCredentials({}) },
        error: null,
      }),
      actingAgentId: 'agent_123',
      provider: 'proxypics',
      env: 'live',
    })

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Invalid ProxyPics credentials: missing apiKey',
      operatorHint:
        'verifyProviderConnection decrypted credentials then plugin.validateCredentials rejected the stored shape',
    })
  })

  it('returns an operator hint when the provider plugin has no testConnection implementation', async () => {
    const result = await verifyProviderConnection({
      serviceClient: createServiceClient({
        data: {
          credentials_encrypted: encryptIntegrationCredentials({ api_key: 'wg_live_key' }),
        },
        error: null,
      }),
      actingAgentId: 'agent_123',
      provider: 'wegolook',
      env: 'live',
    })

    expect(result).toEqual({
      ok: false,
      status: 501,
      error: 'Provider wegolook does not support test_connection yet',
      operatorHint:
        'verifyProviderConnection reached provider plugin without testConnection implementation',
    })
  })
})
