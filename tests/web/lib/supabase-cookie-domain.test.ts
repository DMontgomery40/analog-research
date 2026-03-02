import { describe, expect, it } from 'vitest'

import { getSupabaseAuthCookieDomain } from '@/lib/supabase/cookie-domain'

describe('getSupabaseAuthCookieDomain', () => {
  it('returns a shared cookie domain for analogresearch hosts', () => {
    expect(getSupabaseAuthCookieDomain('analog-research.org')).toBe('.analog-research.org')
    expect(getSupabaseAuthCookieDomain('www.analog-research.org')).toBe('.analog-research.org')
    expect(getSupabaseAuthCookieDomain('api.analog-research.org')).toBe('.analog-research.org')
    expect(getSupabaseAuthCookieDomain('analog-research.org:3000')).toBe('.analog-research.org')
  })

  it('does not set a domain for localhost/ip', () => {
    expect(getSupabaseAuthCookieDomain('localhost')).toBeUndefined()
    expect(getSupabaseAuthCookieDomain('localhost:3000')).toBeUndefined()
    expect(getSupabaseAuthCookieDomain('127.0.0.1')).toBeUndefined()
  })

  it('returns undefined for other hosts', () => {
    expect(getSupabaseAuthCookieDomain('example.com')).toBeUndefined()
  })
})

