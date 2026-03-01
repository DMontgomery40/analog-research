const API_ONLY_SUBDOMAIN_PREFIXES = ['api.', 'supabase.']

function isApiOnlySubdomain(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return API_ONLY_SUBDOMAIN_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function stripLeadingSubdomain(hostname: string): string {
  const dotIndex = hostname.indexOf('.')
  if (dotIndex === -1) {
    return hostname
  }
  return hostname.slice(dotIndex + 1)
}

function parseCandidateOrigin(candidate: string | null | undefined): URL | null {
  if (!candidate) return null
  try {
    return new URL(candidate)
  } catch {
    return null
  }
}

function normalizeOrigin(url: URL): string {
  return url.origin.replace(/\/$/, '')
}

export function resolveCanonicalAppOrigin(requestOrigin: string): string {
  const requestUrl = parseCandidateOrigin(requestOrigin)
  const envCandidates = [
    parseCandidateOrigin(process.env.NEXT_PUBLIC_SITE_URL || ''),
    parseCandidateOrigin(process.env.NEXT_PUBLIC_APP_URL || ''),
  ].filter((candidate): candidate is URL => Boolean(candidate))

  const preferredFromEnv = envCandidates.find((candidate) => !isApiOnlySubdomain(candidate.hostname))
  if (preferredFromEnv) {
    return normalizeOrigin(preferredFromEnv)
  }

  if (requestUrl) {
    if (!isApiOnlySubdomain(requestUrl.hostname)) {
      return normalizeOrigin(requestUrl)
    }

    const rewritten = new URL(requestUrl.origin)
    rewritten.hostname = stripLeadingSubdomain(rewritten.hostname)
    return normalizeOrigin(rewritten)
  }

  throw new Error('Unable to resolve canonical app origin')
}

