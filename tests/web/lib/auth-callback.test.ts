import { describe, expect, it } from 'vitest'

import { buildAuthCallbackRedirectTo, parseAuthCallbackUrl } from '@/lib/auth-callback'

describe('parseAuthCallbackUrl', () => {
  it('parses code callback', () => {
    const url = new URL('http://localhost:3000/auth/callback?code=abc&redirect=/dashboard/settings')
    expect(parseAuthCallbackUrl(url)).toEqual({
      kind: 'code',
      code: 'abc',
      redirect: '/dashboard/settings',
    })
  })

  it('parses otp callback', () => {
    const url = new URL('http://localhost:3000/auth/callback?token_hash=th&type=signup&redirect=/dashboard')
    expect(parseAuthCallbackUrl(url)).toEqual({
      kind: 'otp',
      tokenHash: 'th',
      otpType: 'signup',
      redirect: '/dashboard',
    })
  })

  it('parses error callback (query params)', () => {
    const url = new URL('http://localhost:3000/auth/callback?error=auth&error_code=otp_expired&error_description=Link%20expired')
    expect(parseAuthCallbackUrl(url)).toEqual({
      kind: 'error',
      error: 'auth',
      errorCode: 'otp_expired',
      errorDescription: 'Link expired',
      redirect: '/dashboard',
    })
  })

  it('sanitizes redirect to a safe path', () => {
    const url = new URL('http://localhost:3000/auth/callback?code=abc&redirect=https://evil.com/phish')
    expect(parseAuthCallbackUrl(url)).toEqual({
      kind: 'code',
      code: 'abc',
      redirect: '/dashboard',
    })
  })

  it('rejects protocol-relative redirects', () => {
    const url = new URL('http://localhost:3000/auth/callback?code=abc&redirect=//evil.com/phish')
    expect(parseAuthCallbackUrl(url)).toEqual({
      kind: 'code',
      code: 'abc',
      redirect: '/dashboard',
    })
  })

  it('rejects redirects containing newlines', () => {
    const url = new URL('http://localhost:3000/auth/callback?code=abc&redirect=/dashboard%0Aevil')
    expect(parseAuthCallbackUrl(url)).toEqual({
      kind: 'code',
      code: 'abc',
      redirect: '/dashboard',
    })
  })

  it('preserves redirect query params and fragments', () => {
    const url = new URL(
      'http://localhost:3000/auth/callback?code=abc&redirect=%2Fdashboard%2Fsettings%3Ftab%3Dkeys%26page%3D2%23section'
    )
    expect(parseAuthCallbackUrl(url)).toEqual({
      kind: 'code',
      code: 'abc',
      redirect: '/dashboard/settings?tab=keys&page=2#section',
    })
  })

  it('returns unknown when no callback params are present', () => {
    const url = new URL('http://localhost:3000/auth/callback?redirect=/dashboard')
    expect(parseAuthCallbackUrl(url)).toEqual({
      kind: 'unknown',
      redirect: '/dashboard',
    })
  })
})

describe('buildAuthCallbackRedirectTo', () => {
  it('URL-encodes the redirect query param', () => {
    const redirect = '/dashboard/settings?tab=keys&page=2#section'
    const redirectTo = buildAuthCallbackRedirectTo('http://localhost:3000', redirect)
    const url = new URL(redirectTo)

    expect(url.pathname).toBe('/auth/callback')
    expect(url.searchParams.get('redirect')).toBe(redirect)
    expect(url.hash).toBe('')
  })
})
