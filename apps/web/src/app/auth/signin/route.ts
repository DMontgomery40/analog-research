import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { createErrorResponse } from '@/lib/supabase/errors'
import {
  buildRateLimitError,
  enforceRateLimit,
  rateLimitHeaders,
  resolveRateLimitLimit,
} from '@/lib/rate-limit'

export const runtime = 'nodejs'

const SIGN_IN_WINDOW_MS = 60_000
const DEFAULT_SIGN_IN_RATE_LIMIT_PER_MINUTE = 20

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = request.headers.get('x-real-ip')?.trim()
  return realIp || 'unknown'
}

type SignInRequestBody = {
  email?: unknown
  password?: unknown
}

/**
 * Server-side password sign-in endpoint.
 *
 * @remarks
 * Why we do password sign-in server-side (instead of calling Supabase Auth directly from the browser):
 * - Supabase's `/auth/v1/token` endpoints are rate limited and can be easy to exhaust during debugging,
 *   QA, or when many users share a NAT'd IP. When that happens, sign-in fails for real users.
 * - By proxying the sign-in through our server runtime, the request to Supabase comes from the
 *   deployment's network (Netlify), not the end user's device. This often avoids per-device/IP limits.
 * - This also gives us a single place to add future protections (captcha, app-level rate limiting,
 *   additional logging) without sprinkling auth logic across the client.
 *
 * Important:
 * - We never log the password.
 * - We avoid logging email addresses (PII) unless it is absolutely necessary for debugging.
 * - Session cookies are still set using `@supabase/ssr` cookie storage, so the rest of the app
 *   (server components + client components) continues to work the same way.
 */
export async function POST(request: Request) {
  const log = logger.withContext('app/auth/signin/route.ts', 'POST')

  let body: SignInRequestBody = {}
  try {
    body = await request.json()
  } catch {
    return createErrorResponse('Invalid request body.', 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) {
    return createErrorResponse('Email and password are required.', 400)
  }

  const signInRateLimit = resolveRateLimitLimit({
    envVar: 'AUTH_SIGNIN_RATE_LIMIT_PER_MINUTE',
    fallback: DEFAULT_SIGN_IN_RATE_LIMIT_PER_MINUTE,
  })
  const clientIp = getClientIp(request)
  const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16)
  const rateLimitStatus = enforceRateLimit({
    key: `auth-signin:${clientIp}:${emailHash}`,
    limit: signInRateLimit,
    windowMs: SIGN_IN_WINDOW_MS,
  })

  if (!rateLimitStatus.allowed) {
    const rateLimitError = buildRateLimitError(rateLimitStatus)
    log.warn('Password sign-in rate limited', {
      ip: clientIp,
      remaining: rateLimitStatus.remaining,
      limit: rateLimitStatus.limit,
    })
    return NextResponse.json(rateLimitError.body, {
      status: rateLimitError.status,
      headers: rateLimitError.headers,
    })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    log.warn('Password sign-in failed', {
      code: (error as any).code ?? null,
      status: (error as any).status ?? null,
    })

    const status = (error as any).status || 401
    const code = (error as any).code
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to sign in.',
        ...(code ? { code } : {}),
      },
      {
        status,
        headers: rateLimitHeaders(rateLimitStatus),
      }
    )
  }

  if (!data?.user) {
    log.warn('Password sign-in returned no user')
    return NextResponse.json(
      { success: false, error: 'Authentication succeeded but no user was returned.' },
      { status: 500, headers: rateLimitHeaders(rateLimitStatus) }
    )
  }

  return NextResponse.json({ success: true }, { headers: rateLimitHeaders(rateLimitStatus) })
}
