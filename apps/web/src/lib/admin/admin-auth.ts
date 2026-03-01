import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export function configuredAdminEmails(): string[] {
  // Prefer the admin dashboard allowlist, but fall back to moderation allowlist for backward compatibility.
  const raw = process.env.ADMIN_EMAILS || process.env.MODERATION_ADMIN_EMAILS || ''
  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export interface AdminAuthResult {
  ok: boolean
  status: number
  error: string | null
  email: string | null
  userId: string | null
}

export async function requireAllowlistedUser(input: {
  allowlist: string[]
  notConfiguredError: string
}): Promise<AdminAuthResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      status: 401,
      error: 'Unauthorized',
      email: null,
      userId: null,
    }
  }

  const email = user.email?.toLowerCase() || null

  if (input.allowlist.length === 0) {
    return {
      ok: false,
      status: 503,
      error: input.notConfiguredError,
      email,
      userId: user.id,
    }
  }

  if (!email || !input.allowlist.includes(email)) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden',
      email,
      userId: user.id,
    }
  }

  return {
    ok: true,
    status: 200,
    error: null,
    email,
    userId: user.id,
  }
}

/**
 * Check if current user is an admin. Use in API routes.
 */
export async function requireAdmin(): Promise<AdminAuthResult> {
  return requireAllowlistedUser({
    allowlist: configuredAdminEmails(),
    notConfiguredError: 'Admin allowlist is not configured',
  })
}

/**
 * Check admin status and redirect if not authorized.
 * Use in server components that need admin protection.
 */
export async function requireAdminOrRedirect(): Promise<{
  email: string
  userId: string
}> {
  const result = await requireAdmin()

  if (result.status === 401) {
    redirect('/login')
  }

  if (!result.ok || !result.email || !result.userId) {
    redirect('/dashboard')
  }

  return { email: result.email, userId: result.userId }
}

/**
 * Check if current user is an admin without redirecting.
 * Use for conditional rendering.
 */
export async function getIsAdmin(): Promise<boolean> {
  const result = await requireAdmin()
  return result.ok
}
