import { describe, expect, it } from 'vitest'

import { sanitizeAdminSearch } from '@/lib/admin/admin-list-utils'

describe('admin list utils', () => {
  it('returns null for empty or whitespace input', () => {
    expect(sanitizeAdminSearch(null)).toEqual({ ok: true, value: null })
    expect(sanitizeAdminSearch('   ')).toEqual({ ok: true, value: null })
  })

  it('rejects reserved filter characters', () => {
    const result = sanitizeAdminSearch('foo,bar')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('unsupported characters')
    }
  })

  it('escapes SQL LIKE wildcards', () => {
    const result = sanitizeAdminSearch('100% _match_')
    expect(result).toEqual({ ok: true, value: '100\\% \\_match\\_' })
  })
})
