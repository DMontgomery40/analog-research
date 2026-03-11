import { describe, expect, it } from 'vitest'

import {
  buildIntegrationCredentialsMask,
  parseIntegrationCredentialUpdate,
} from '@/lib/integrations/credentials'
import { getExternalProviderPlugin } from '@/lib/external-jobs/providers/registry'

describe('integration credential parsing', () => {
  const proxyPicsDescriptor = getExternalProviderPlugin('proxypics').descriptor

  it('supports legacy api_key payloads', () => {
    const parsed = parseIntegrationCredentialUpdate({
      descriptor: proxyPicsDescriptor,
      body: {
        env: 'live',
        api_key: 'pk_live_12345678',
      },
    })

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.env).toBe('live')
      expect(parsed.value.credentials).toEqual({ api_key: 'pk_live_12345678' })
    }
  })

  it('supports descriptor-shaped credentials payloads', () => {
    const parsed = parseIntegrationCredentialUpdate({
      descriptor: proxyPicsDescriptor,
      body: {
        env: 'sandbox',
        credentials: {
          api_key: 'pk_sandbox_12345678',
        },
      },
    })

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.env).toBe('sandbox')
      expect(parsed.value.credentials).toEqual({ api_key: 'pk_sandbox_12345678' })
    }
  })

  it('supports camelCase credential aliases', () => {
    const parsed = parseIntegrationCredentialUpdate({
      descriptor: proxyPicsDescriptor,
      body: {
        credentials: {
          apiKey: 'pk_live_camel_case',
        },
      },
    })

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.credentials.api_key).toBe('pk_live_camel_case')
      expect(parsed.value.credentials.apiKey).toBeUndefined()
    }
  })

  it('rejects missing required provider credentials', () => {
    const parsed = parseIntegrationCredentialUpdate({
      descriptor: proxyPicsDescriptor,
      body: {
        env: 'live',
      },
    })

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error).toContain('Missing required credential fields')
      expect(parsed.operatorHint).toBe(
        'parseIntegrationCredentialUpdate did not populate required credentialFields from body or body.credentials'
      )
    }
  })

  it('returns an operator hint when no credential values can be normalized', () => {
    const optionalDescriptor = {
      ...proxyPicsDescriptor,
      credentialFields: proxyPicsDescriptor.credentialFields.map((field) => ({
        ...field,
        required: false,
      })),
    }

    const parsed = parseIntegrationCredentialUpdate({
      descriptor: optionalDescriptor,
      body: {
        env: 'live',
        credentials: {
          api_key: '   ',
        },
      },
    })

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error).toBe('No credential values provided')
      expect(parsed.operatorHint).toBe(
        'parseIntegrationCredentialUpdate found no stringifiable credentials in body or body.credentials'
      )
    }
  })
})

describe('integration credential masks', () => {
  it('returns direct secret mask when one secret field exists', () => {
    const descriptor = getExternalProviderPlugin('proxypics').descriptor
    const mask = buildIntegrationCredentialsMask(descriptor, { api_key: 'pk_live_secret' })
    expect(mask).toBe('pk_l…cret')
  })

  it('returns named masks when multiple secret fields exist', () => {
    const mask = buildIntegrationCredentialsMask({
      id: 'proxypics',
      displayName: 'Test Provider',
      status: 'active',
      description: 'Test',
      supportedEnvs: ['live'],
      capabilities: {
        test_connection: true,
        create_field_check: true,
        refresh_field_check: true,
        cancel_field_check: true,
        approve_field_check: true,
        reject_field_check: true,
        send_field_check_message: true,
        list_templates: false,
      },
      credentialFields: [
        {
          name: 'api_key',
          label: 'API key',
          type: 'secret',
          required: true,
          description: 'test',
        },
        {
          name: 'api_secret',
          label: 'API secret',
          type: 'secret',
          required: true,
          description: 'test',
        },
      ],
    }, {
      api_key: 'abc',
      api_secret: 'xyz',
    })

    expect(mask).toBe('api_key=****, api_secret=****')
  })
})
