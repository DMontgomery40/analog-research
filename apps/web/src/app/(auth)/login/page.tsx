'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { BrandMark } from '@/components/brand-mark'
import { createClient } from '@/lib/supabase/client'
import { buildAuthCallbackRedirectTo, sanitizeRedirectPath } from '@/lib/auth-callback'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const redirect = sanitizeRedirectPath(searchParams.get('redirect'))

  useEffect(() => {
    const queryError = searchParams.get('error')
    const queryDescription = searchParams.get('error_description')
    const queryCode = searchParams.get('error_code')

    if (queryError) {
      setError(queryDescription || `${queryError}${queryCode ? ` (${queryCode})` : ''}`)
      return
    }

    /**
     * @remarks
     * Some Supabase flows (and intermediaries) return errors in the hash fragment.
     * Route handlers cannot see fragments, so we parse and surface them client-side.
     */
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
    if (!hash) return

    const hashParams = new URLSearchParams(hash)
    const hashError = hashParams.get('error')
    const hashDescription = hashParams.get('error_description')
    const hashCode = hashParams.get('error_code')

    if (hashError) {
      setError(hashDescription || `${hashError}${hashCode ? ` (${hashCode})` : ''}`)
    }
  }, [searchParams])

  /**
   * Handles email/password sign-in.
   *
   * @remarks
   * We proxy password sign-in through our own server route (`/auth/signin`) instead of calling
   * Supabase Auth directly from the browser. Supabase token endpoints are rate limited, and during QA,
   * debugging, or when many users share a NAT'd IP, browser-originated sign-ins can be blocked by
   * per-user/IP throttles.
   *
   * The server route performs the same Supabase sign-in but from the deployment runtime (Netlify),
   * and sets the session cookies via `@supabase/ssr` cookie storage. After success we can simply
   * navigate to the intended redirect target.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)

    const response = await fetch('/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const payload = await response.json().catch(() => null) as
      | { success: true }
      | { success: false; error: string; code?: string }
      | null

    if (!response.ok || !payload || payload.success !== true) {
      setError(
        payload && 'error' in payload && payload.error
          ? payload.error
          : 'Failed to sign in.'
      )
      setLoading(false)
      return
    }

    // Ensure the next request includes the freshly-set auth cookies.
    window.location.replace(redirect)
  }

  /** ai-slop-ok: intentionally similar to signup handleGoogleSignup - both initiate OAuth flow */
  /**
   * Initiates Google OAuth sign-in.
   *
   * @remarks
   * This only starts the redirect to Google. The callback exchange happens via:
   * - `/auth/callback` (client page) which performs the token exchange + cookie write.
   *
   * We keep the exchange in the browser so the PKCE verifier is read from the same storage it was
   * written to when initiating the OAuth flow.
   */
  async function handleGoogleLogin() {
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: buildAuthCallbackRedirectTo(window.location.origin, redirect),
      },
    })
    if (error) {
      setError(error.message || 'Failed to initiate Google login')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-8">
            <BrandMark className="h-10 w-10" />
            <span className="font-bold text-2xl">Analog Research</span>
          </Link>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground mt-2">Sign in to your account</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-card text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2 border border-border py-2 rounded-md font-medium hover:bg-accent transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google
          </button>
        </div>

        <p className="text-center mt-6 text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
