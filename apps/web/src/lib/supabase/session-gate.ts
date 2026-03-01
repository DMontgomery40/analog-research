import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'
import { getSupabaseAuthCookieDomain } from '@/lib/supabase/cookie-domain'
import { sanitizeRedirectPath } from '@/lib/auth-callback'
import { logger } from '@/lib/logger'

type CookieToSet = { name: string; value: string; options?: Partial<ResponseCookie> }

/**
 * Session gating for the "main" web host (e.g. `analog-research.org` / `www.analog-research.org`).
 *
 * @remarks
 * Why this exists:
 * - Analog Research uses a host-based proxy layer (`apps/web/src/proxy.ts`) instead of relying on
 *   Next.js per-route guards. This is required for our multi-subdomain routing (api.* + supabase.*)
 *   while keeping the primary app on the apex domain.
 *
 * @remarks
 * Important operational constraint:
 * - Supabase Auth endpoints are rate limited. Calling `supabase.auth.getUser()` on every
 *   request (including unauthenticated traffic, bots, and prefetches) can exhaust that
 *   limit and break real user sign-in/sign-up.
 *
 * @remarks
 * Therefore we:
 * - Avoid hitting Supabase at all for routes that don't need auth gating.
 * - Use a cookie heuristic to decide whether we *might* have a session.
 * - Only validate the session with Supabase when a protected route is accessed and a
 *   session cookie is present (or when an auth page is accessed and we need to decide
 *   whether to redirect away from login/signup).
 *
 * This keeps auth redirects correct without turning every request into an auth API call.
 */
function isSupabaseSessionCookieName(name: string): boolean {
  /**
   * @remarks
   * `@supabase/ssr` stores sessions in cookies (not localStorage) using a storage key that ends in
   * `-auth-token`, plus optional chunk suffixes when values exceed cookie size limits.
   *
   * We intentionally ignore PKCE verifier cookies so an in-progress OAuth flow doesn't get
   * misclassified as "already signed in".
   */
  if (name.includes('code-verifier')) return false
  if (name.includes('auth-token')) return true

  /**
   * @remarks
   * Legacy cookie names from older Supabase helpers. Still safe to treat as "likely logged in".
   */
  if (name === 'sb-access-token' || name === 'sb-refresh-token') return true

  return false
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const authDebug =
    request.nextUrl.searchParams.get('__auth_debug') === '1' ||
    request.headers.get('x-auth-debug') === '1'

  /**
   * Protected routes (require authentication).
   *
   * @remarks
   * This is intentionally path-prefix based. We want the proxy gate to be simple and predictable,
   * and we do not want to accidentally gate static assets or API endpoints with auth lookups.
   */
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin')
  const isAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup')

  /**
   * Avoid hitting Supabase auth for routes that don't need session checks.
   *
   * @remarks
   * Most requests (marketing pages, docs, assets, etc.) should not incur an auth roundtrip.
   */
  if (!isProtectedRoute && !isAuthRoute) {
    if (authDebug && pathname.startsWith('/auth/callback')) {
      logger
        .withContext('lib/supabase/session-gate.ts', 'updateSession')
        .info('Auth debug: bypassing session gate for callback route', { pathname })
    }
    return NextResponse.next({ request })
  }

  const hasSessionCookie = request.cookies.getAll().some((cookie) => isSupabaseSessionCookieName(cookie.name))

  /**
   * Auth routes do not need session validation unless we actually have a session cookie.
   *
   * @remarks
   * This prevents high-volume unauthenticated traffic from hammering Supabase Auth. When a session cookie
   * exists, we still validate before redirecting away from login/signup to avoid redirect loops caused by
   * stale/expired cookies.
   */
  if (isAuthRoute && !hasSessionCookie) {
    return NextResponse.next({ request })
  }

  /**
   * Fast-path: protected route with no session cookies can immediately redirect.
   *
   * @remarks
   * We do this before instantiating a Supabase client to avoid unnecessary auth traffic.
   */
  if (isProtectedRoute && !hasSessionCookie) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  /**
   * From here down we have a route that cares about auth and we have a session-like cookie.
   * Validate it with Supabase so stale/expired sessions get handled cleanly.
   */
  let supabaseResponse = NextResponse.next({
    request,
  })

  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? ''
  const cookieDomain = getSupabaseAuthCookieDomain(forwardedHost)
  const shouldSecureCookie = cookieDomain ? forwardedProto === 'https' || forwardedProto === '' : false

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: cookieDomain
        ? { domain: cookieDomain, secure: shouldSecureCookie }
        : undefined,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const { data, error } = await supabase.auth.getUser()
  const user = data.user

  if (isProtectedRoute && !user) {
    // Redirect to login if not authenticated
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  if (isAuthRoute) {
    /**
     * @remarks
     * Auth routes are a special case:
     * - If the session is valid, we want to keep users out of /login and /signup.
     * - If the session is invalid (stale cookies), we must *not* redirect away or we create a loop
     *   (/login -> /dashboard -> /login ...) that can also amplify Supabase auth rate limiting.
     */
    if (user) {
      const redirectTarget = sanitizeRedirectPath(request.nextUrl.searchParams.get('redirect'))
      const isRedirectAuthRoute =
        redirectTarget.startsWith('/login') || redirectTarget.startsWith('/signup')

      if (!isRedirectAuthRoute) {
        return NextResponse.redirect(new URL(redirectTarget, request.nextUrl.origin))
      }

      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    if (error) {
      /**
       * @remarks
       * If Supabase returns an error while validating the session on an auth page, we fail open
       * (render the login/signup UI) instead of redirecting. This gives users a way out when
       * cookies are stale or when Supabase is temporarily rate limiting.
       */
      return supabaseResponse
    }
  }

  return supabaseResponse
}
