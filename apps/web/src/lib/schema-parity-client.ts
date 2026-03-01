interface SchemaParityErrorPayload {
  success?: boolean
  error?: unknown
  code?: unknown
  scope?: unknown
  missing_tables?: unknown
}

function toSafeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function formatSchemaParityError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const typed = payload as SchemaParityErrorPayload
  const error = toSafeString(typed.error)
  const code = toSafeString(typed.code)

  if (code !== 'SCHEMA_PARITY_UNAVAILABLE') {
    return error || fallback
  }

  const missing = Array.isArray(typed.missing_tables)
    ? typed.missing_tables
      .map((value) => toSafeString(value))
      .filter((value): value is string => Boolean(value))
    : []

  if (missing.length === 0) {
    return error || fallback
  }

  return `${error || fallback} Missing tables: ${missing.join(', ')}.`
}
