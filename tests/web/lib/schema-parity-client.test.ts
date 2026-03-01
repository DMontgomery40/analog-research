import { describe, expect, it } from 'vitest'

import { formatSchemaParityError } from '@/lib/schema-parity-client'

describe('formatSchemaParityError', () => {
  it('returns fallback when payload is not an object', () => {
    expect(formatSchemaParityError(null, 'fallback')).toBe('fallback')
  })

  it('returns raw error for non schema-parity payloads', () => {
    const value = formatSchemaParityError(
      {
        success: false,
        error: 'Permission denied',
        code: '42501',
      },
      'fallback'
    )

    expect(value).toBe('Permission denied')
  })

  it('appends missing tables for schema-parity payloads', () => {
    const value = formatSchemaParityError(
      {
        success: false,
        error: 'Required database schema is unavailable for external_integrations.',
        code: 'SCHEMA_PARITY_UNAVAILABLE',
        missing_tables: ['external_integrations', 'external_jobs'],
      },
      'fallback'
    )

    expect(value).toBe(
      'Required database schema is unavailable for external_integrations. Missing tables: external_integrations, external_jobs.'
    )
  })
})
