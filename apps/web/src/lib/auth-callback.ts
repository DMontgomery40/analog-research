export type AuthCallbackAction =
  | {
      kind: 'code'
      code: string
      redirect: string
    }
  | {
      kind: 'otp'
      tokenHash: string
      otpType: string
      redirect: string
    }
  | {
      kind: 'error'
      error: string
      errorDescription?: string
      errorCode?: string
      redirect: string
    }
  | {
      kind: 'unknown'
      redirect: string
    }

export function sanitizeRedirectPath(input: string | null, fallback: string = '/dashboard'): string {
  if (!input) return fallback
  if (!input.startsWith('/')) return fallback
  if (input.startsWith('//')) return fallback
  if (input.startsWith('/\\')) return fallback
  if (input.includes('\n') || input.includes('\r')) return fallback
  return input
}

export function buildAuthCallbackRedirectTo(origin: string, redirect: string): string {
  const callbackUrl = new URL('/auth/callback', origin)
  callbackUrl.searchParams.set('redirect', redirect)
  return callbackUrl.toString()
}

export function parseAuthCallbackUrl(url: URL): AuthCallbackAction {
  const redirect = sanitizeRedirectPath(url.searchParams.get('redirect'))

  const error = url.searchParams.get('error')
  if (error) {
    return {
      kind: 'error',
      error,
      errorDescription: url.searchParams.get('error_description') ?? undefined,
      errorCode: url.searchParams.get('error_code') ?? undefined,
      redirect,
    }
  }

  const code = url.searchParams.get('code')
  if (code) {
    return {
      kind: 'code',
      code,
      redirect,
    }
  }

  const tokenHash = url.searchParams.get('token_hash')
  const otpType = url.searchParams.get('type')
  if (tokenHash && otpType) {
    return {
      kind: 'otp',
      tokenHash,
      otpType,
      redirect,
    }
  }

  return {
    kind: 'unknown',
    redirect,
  }
}
