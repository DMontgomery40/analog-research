import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'
import { getSupabaseAuthCookieDomain } from '@/lib/supabase/cookie-domain'
import { logger } from '@/lib/logger'

// Note: Database types are available from @analogresearch/database/types but
// we use any here to avoid type inference issues with complex queries

type CookieToSet = { name: string; value: string; options?: Partial<ResponseCookie> }

export async function createClient() {
  const log = logger.withContext('lib/supabase/server.ts', 'createClient')
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }

  if (!supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured')
  }

  const cookieStore = await cookies()
  const headerStore = await headers()
  const forwardedHost = headerStore.get('x-forwarded-host') ?? headerStore.get('host')
  const forwardedProto = headerStore.get('x-forwarded-proto') ?? ''
  const cookieDomain = getSupabaseAuthCookieDomain(forwardedHost)
  const shouldSecureCookie = cookieDomain ? forwardedProto === 'https' || forwardedProto === '' : false

  return createServerClient<any>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookieOptions: cookieDomain
        ? { domain: cookieDomain, secure: shouldSecureCookie }
        : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions,
            // but we still log to avoid silent auth drift.
            log.warn('Unable to persist Supabase auth cookies in current context', {
              cookieCount: cookiesToSet.length,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        },
      },
    }
  )
}

export async function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

  if (!serviceRoleKey) {
    throw new Error('Missing Supabase service key: set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  }

  return createSupabaseClient<any>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
