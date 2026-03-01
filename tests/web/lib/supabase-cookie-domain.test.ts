import { describe, expect, it } from 'vitest'

import { getSupabaseAuthCookieDomain } from '@/lib/supabase/cookie-domain'

describe('getSupabaseAuthCookieDomain', () => {
  it('returns a shared cookie domain for analoglabor hosts', () => {
    expect(getSupabaseAuthCookieDomain('analoglabor.com')).toBe('.analoglabor.com')
    expect(getSupabaseAuthCookieDomain('www.analoglabor.com')).toBe('.analoglabor.com')
    expect(getSupabaseAuthCookieDomain('api.analoglabor.com')).toBe('.analoglabor.com')
    expect(getSupabaseAuthCookieDomain('analoglabor.com:3000')).toBe('.analoglabor.com')
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

