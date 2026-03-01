'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { sanitizeRedirectPath } from '@/lib/auth-callback'
import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/client'

type CallbackState =
  | { status: 'working'; message: string }
  | { status: 'error'; message: string; loginHref: string }

/**
 * Auth callback page for Supabase (OAuth PKCE + email OTP links).
 *
 * @remarks
 * Why this is still a page (client-side) and not only a server route:
 * - Supabase redirects the user to `/auth/callback?...` after OAuth/magic-link flows.
 * - Route Handlers cannot see hash fragments (`#...`). Some providers surface errors in the fragment, so we
 *   parse and forward those errors to `/login` client-side.
 * - We perform the actual session exchange in the browser so the PKCE verifier is read from the same
 *   cookie storage it was written to when initiating the auth flow.
 *
 * @remarks
 * Security notes:
 * - `redirect` is sanitized to avoid open redirects.
 * - We use `location.replace()` to keep OAuth `code` / OTP params out of browser history.
 */
function buildLoginHref(origin: string, redirect: string, params?: Record<string, string | null | undefined>) {
  const loginUrl = new URL('/login', origin)
  loginUrl.searchParams.set('redirect', redirect)

  for (const [key, value] of Object.entries(params ?? {})) {
    if (!value) continue
    loginUrl.searchParams.set(key, value)
  }

  return loginUrl.toString()
}

function buildCompleteHref(origin: string, redirect: string) {
  const completeUrl = new URL('/auth/callback/complete', origin)
  completeUrl.searchParams.set('redirect', redirect)
  return completeUrl.toString()
}

export default function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>({
    status: 'working',
    message: 'Completing sign in...',
  })

  useEffect(() => {
    const run = async () => {
      const log = logger.withContext('app/auth/callback/page.tsx', 'run')
      const url = new URL(window.location.href)
      const redirect = sanitizeRedirectPath(url.searchParams.get('redirect'))

      const queryError = url.searchParams.get('error')
      const queryDescription = url.searchParams.get('error_description')
      const queryCode = url.searchParams.get('error_code')

      if (queryError) {
        /**
         * @remarks
         * Fail closed back to `/login` with the error surfaced in the UI.
         *
         * We intentionally avoid logging provider error details; upstreams sometimes include metadata
         * that we do not want in logs.
         */
        window.location.replace(buildLoginHref(url.origin, redirect, {
          error: queryError,
          error_description: queryDescription,
          error_code: queryCode,
        }))
        return
      }

      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
      const hashParams = hash ? new URLSearchParams(hash) : null

      const hashError = hashParams?.get('error') || null
      const hashDescription = hashParams?.get('error_description') || null
      const hashCode = hashParams?.get('error_code') || null

      if (hashError) {
        // Hash fragments are client-only; forward the error to /login so users see what happened.
        window.location.replace(buildLoginHref(url.origin, redirect, {
          error: hashError,
          error_description: hashDescription,
          error_code: hashCode,
        }))
        return
      }

      const code = url.searchParams.get('code')
      const tokenHash = url.searchParams.get('token_hash')
      const otpType = url.searchParams.get('type')

      /**
       * @remarks
       * Convert Supabase's callback into an exchange + redirect.
       *
       * We use `replace` so we don't leave `/auth/callback?...` (including OAuth `code`) in browser history.
       */
      if (code) {
        // Avoid any automatic URL session detection; we explicitly exchange `code` once.
        const supabase = createClient({ auth: { detectSessionInUrl: false, autoRefreshToken: false } })
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          window.location.replace(buildLoginHref(url.origin, redirect, {
            error: (error as any).code || 'auth',
            error_description: error.message,
          }))
          return
        }

        window.location.replace(buildCompleteHref(url.origin, redirect))
        return
      }

      if (tokenHash && otpType) {
        const supabase = createClient({ auth: { detectSessionInUrl: false, autoRefreshToken: false } })
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType as any,
        })
        if (error) {
          window.location.replace(buildLoginHref(url.origin, redirect, {
            error: (error as any).code || 'auth',
            error_description: error.message,
          }))
          return
        }

        window.location.replace(buildCompleteHref(url.origin, redirect))
        return
      }

      log.warn('Auth callback missing parameters', {
        hasCode: Boolean(code),
        hasOtp: Boolean(tokenHash && otpType),
        hasHash: Boolean(hash),
      })

      window.location.replace(buildLoginHref(url.origin, redirect, {
        error: 'auth',
        error_description: 'Missing auth callback parameters.',
      }))
    }

    run().catch((error) => {
      const log = logger.withContext('app/auth/callback/page.tsx', 'run.catch')
      const message = error instanceof Error ? error.message : 'Authentication failed.'
      log.error('Unhandled auth callback error', undefined, error instanceof Error ? error : { message })
      const origin = window.location.origin
      const redirect = sanitizeRedirectPath(new URL(window.location.href).searchParams.get('redirect'))
      setState({
        status: 'error',
        message,
        loginHref: buildLoginHref(origin, redirect, {
          error: 'auth',
          error_description: message,
        }),
      })
    })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-card border border-border rounded-xl p-6">
          {state.status === 'working' ? (
            <>
              <div className="animate-pulse text-muted-foreground">
                {state.message}
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                If this takes more than a few seconds, go back and try again.
              </div>
            </>
          ) : (
            <>
              <div className="text-destructive text-sm">
                {state.message}
              </div>
              <div className="mt-4">
                <Link href={state.loginHref} className="text-primary hover:underline">
                  Back to login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
