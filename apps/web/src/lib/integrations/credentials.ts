import type { ExternalProviderDescriptor } from '@/lib/external-jobs/providers/types'
import type { ExternalProviderEnv } from '@/lib/external-jobs/types'
import { maskSecret } from '@/lib/integrations-secrets'

interface ParseCredentialUpdateParams {
  descriptor: ExternalProviderDescriptor
  body: Record<string, unknown>
}

type ParseCredentialUpdateResult =
  | {
    ok: true
    value: {
      env: ExternalProviderEnv
      credentials: Record<string, string>
    }
  }
  | {
    ok: false
    error: string
  }

function normalizeStringValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return null
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
}

function pickCredentialValue(source: Record<string, unknown>, key: string): string | null {
  const direct = normalizeStringValue(source[key])
  if (direct) return direct

  const camelKey = toCamelCase(key)
  if (camelKey !== key) {
    const camel = normalizeStringValue(source[camelKey])
    if (camel) return camel
  }

  return null
}

function parseEnv(rawEnv: unknown): ExternalProviderEnv {
  return rawEnv === 'sandbox' ? 'sandbox' : 'live'
}

export function parseIntegrationCredentialUpdate(
  params: ParseCredentialUpdateParams
): ParseCredentialUpdateResult {
  const env = parseEnv(params.body.env)
  const credentials: Record<string, string> = {}

  const credentialBlock = params.body.credentials
  if (credentialBlock && typeof credentialBlock === 'object' && !Array.isArray(credentialBlock)) {
    for (const [key, rawValue] of Object.entries(credentialBlock)) {
      const normalized = normalizeStringValue(rawValue)
      if (normalized) {
        credentials[key] = normalized
      }
    }
  }

  for (const field of params.descriptor.credentialFields) {
    const camelField = toCamelCase(field.name)
    if (!credentials[field.name] && camelField !== field.name && credentials[camelField]) {
      credentials[field.name] = credentials[camelField]
    }
    if (camelField !== field.name && credentials[field.name] && credentials[camelField]) {
      delete credentials[camelField]
    }

    if (credentials[field.name]) continue
    const topLevelValue = pickCredentialValue(params.body, field.name)
    if (topLevelValue) {
      credentials[field.name] = topLevelValue
    }
  }

  const legacyApiKey = pickCredentialValue(params.body, 'api_key')
  if (legacyApiKey && !credentials.api_key) {
    credentials.api_key = legacyApiKey
  }

  const missingRequired = params.descriptor.credentialFields
    .filter((field) => field.required && !credentials[field.name])
    .map((field) => field.name)

  if (missingRequired.length > 0) {
    return {
      ok: false,
      error: `Missing required credential fields: ${missingRequired.join(', ')}`,
    }
  }

  if (Object.keys(credentials).length === 0) {
    return {
      ok: false,
      error: 'No credential values provided',
    }
  }

  return {
    ok: true,
    value: {
      env,
      credentials,
    },
  }
}

export function buildIntegrationCredentialsMask(
  descriptor: ExternalProviderDescriptor,
  credentials: Record<string, string>
): string {
  const secretFields = descriptor.credentialFields.filter((field) => field.type === 'secret')

  const secretMasks = secretFields
    .map((field) => {
      const value = credentials[field.name]
      if (!value) return null
      return {
        field: field.name,
        mask: maskSecret(value),
      }
    })
    .filter((entry): entry is { field: string; mask: string } => Boolean(entry))

  if (secretMasks.length === 1) {
    return secretMasks[0].mask
  }

  if (secretMasks.length > 1) {
    return secretMasks.map((entry) => `${entry.field}=${entry.mask}`).join(', ')
  }

  const configuredFields = descriptor.credentialFields
    .map((field) => credentials[field.name])
    .filter((value): value is string => typeof value === 'string' && value.length > 0).length

  return configuredFields > 0 ? `configured (${configuredFields} fields)` : 'configured'
}
