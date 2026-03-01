import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { sanitizeRedirectPath } from '@/lib/auth-callback'
import { logger } from '@/lib/logger'
import { SUPABASE_ERROR_CODES } from '@/lib/supabase/errors'

export const runtime = 'nodejs'

function buildLoginUrl(origin: string, redirect: string, params?: Record<string, string | null | undefined>) {
  const loginUrl = new URL('/login', origin)
  loginUrl.searchParams.set('redirect', redirect)

  for (const [key, value] of Object.entries(params ?? {})) {
    if (!value) continue
    loginUrl.searchParams.set(key, value)
  }

  return loginUrl
}

/**
 * Post-exchange completion step.
 *
 * @remarks
 * At this point the browser has already exchanged the callback params for a session and stored it
 * in cookies. We validate the session server-side and ensure the authenticated account has a
 * corresponding `humans` row before redirecting into the app.
 */
export async function GET(request: Request) {
  const log = logger.withContext('app/auth/callback/complete/route.ts', 'GET')

  const url = new URL(request.url)
  const redirect = sanitizeRedirectPath(url.searchParams.get('redirect'))

  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    log.warn('No user found after callback completion', {
      code: (userError as any)?.code ?? null,
      status: (userError as any)?.status ?? null,
    })

    return NextResponse.redirect(buildLoginUrl(url.origin, redirect, {
      error: (userError as any)?.code || 'no_user',
      error_description: userError?.message || 'Authentication succeeded but no user was returned.',
    }))
  }

  try {
    const { data: human, error: fetchError } = await supabase
      .from('humans')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }

    if (!human) {
      const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Anonymous'
      const { error: insertError } = await supabase
        .from('humans')
        .insert({ user_id: user.id, name })

      if (insertError && insertError.code !== SUPABASE_ERROR_CODES['23505']) {
        throw insertError
      }
    }
  } catch (profileError) {
    log.error(
      'Failed to ensure human profile during callback completion',
      { userId: user.id },
      profileError instanceof Error ? profileError : { message: 'Unknown error' }
    )

    return NextResponse.redirect(buildLoginUrl(url.origin, redirect, {
      error: 'profile_creation_failed',
      error_description:
        'Your account was created but we could not set up your profile. Please try logging in again.',
    }))
  }

  const response = NextResponse.redirect(new URL(redirect, url.origin))
  response.headers.set('cache-control', 'no-store')
  return response
}

