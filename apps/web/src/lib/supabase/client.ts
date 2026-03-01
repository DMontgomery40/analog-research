import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseAuthCookieDomain } from './cookie-domain'

// Note: Database types are available from @analoglabor/database/types but
// we use any here to avoid type inference issues with complex queries

type BrowserAuthOverrides = {
  detectSessionInUrl?: boolean
  autoRefreshToken?: boolean
}

export function createClient(options?: { auth?: BrowserAuthOverrides }) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }

  if (!supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured')
  }

  const cookieDomain = typeof window !== 'undefined'
    ? getSupabaseAuthCookieDomain(window.location.hostname)
    : undefined

  return createBrowserClient<any>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookieOptions: cookieDomain ? { domain: cookieDomain } : undefined,
      auth: options?.auth,
    }
  )
}
