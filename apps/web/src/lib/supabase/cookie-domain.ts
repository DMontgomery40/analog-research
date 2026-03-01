function normalizeHost(host: string | null | undefined): string {
  if (!host) return ''
  return host.trim().toLowerCase().replace(/:\d+$/, '')
}

function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
}

/**
 * Supabase auth uses cookies. If users move between `www.` and apex, host-only cookies
 * will make them appear logged out. For Analog Research production hosts, we set a shared
 * cookie domain so sessions persist across both.
 */
export function getSupabaseAuthCookieDomain(host: string | null | undefined): string | undefined {
  const normalized = normalizeHost(host)
  if (!normalized) return undefined

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    isIpAddress(normalized)
  ) {
    return undefined
  }

  if (normalized === 'analog-research.org' || normalized.endsWith('.analog-research.org')) {
    return '.analog-research.org'
  }

  return undefined
}

