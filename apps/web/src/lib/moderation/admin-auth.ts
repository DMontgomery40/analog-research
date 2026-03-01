import { requireAllowlistedUser, type AdminAuthResult } from '@/lib/admin/admin-auth'

function configuredModerationAdminEmails(): string[] {
  // Prefer moderation allowlist, but fall back to general admin allowlist.
  const raw = process.env.MODERATION_ADMIN_EMAILS || process.env.ADMIN_EMAILS || ''
  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export async function requireModerationAdmin(): Promise<AdminAuthResult> {
  return requireAllowlistedUser({
    allowlist: configuredModerationAdminEmails(),
    notConfiguredError: 'Moderation admin allowlist is not configured',
  })
}
