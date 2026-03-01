import { describe, expect, it } from 'vitest'

import { sanitizeAdminSearch } from '@/lib/admin/admin-list-utils'

describe('Admin search sanitization', () => {
  it('rejects unsupported characters that could influence PostgREST filter strings', () => {
    for (const value of ['foo)', '(foo', 'foo,bar', 'foo(bar)', 'foo,bar)']) {
      const result = sanitizeAdminSearch(value)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('unsupported characters')
      }
    }
  })

  it('normalizes whitespace and escapes %/_ wildcard characters', () => {
    const result = sanitizeAdminSearch('  hello   50%_off  ')
    expect(result).toEqual({ ok: true, value: 'hello 50\\%\\_off' })
  })

  it('treats empty and whitespace-only search as null', () => {
    expect(sanitizeAdminSearch(null)).toEqual({ ok: true, value: null })
    expect(sanitizeAdminSearch('')).toEqual({ ok: true, value: null })
    expect(sanitizeAdminSearch('   ')).toEqual({ ok: true, value: null })
  })
})
