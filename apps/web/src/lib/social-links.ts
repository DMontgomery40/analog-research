const PUBLIC_SOCIAL_LINK_KEYS = [
  'github',
  'linkedin',
  'instagram',
  'youtube',
  'website',
  'x',
  'website_2',
  'website_3',
] as const
const PRIVATE_SOCIAL_LINK_KEYS = ['contact_email'] as const
const SOCIAL_LINK_KEYS = [...PUBLIC_SOCIAL_LINK_KEYS, ...PRIVATE_SOCIAL_LINK_KEYS] as const

export type SocialLinkKey = (typeof SOCIAL_LINK_KEYS)[number]

export type SocialLinks = Partial<Record<SocialLinkKey, string>>

type SocialLinksResult =
  | { ok: true; data: SocialLinks }
  | { ok: false; errors: string[] }

type DbSocialColumns = {
  github_url: string | null
  linkedin_url: string | null
  instagram_url: string | null
  youtube_url: string | null
  website_url: string | null
}

const LEGACY_FIELD_TO_KEY: Record<keyof DbSocialColumns, SocialLinkKey> = {
  github_url: 'github',
  linkedin_url: 'linkedin',
  instagram_url: 'instagram',
  youtube_url: 'youtube',
  website_url: 'website',
}

const HOST_ALLOWLIST: Record<SocialLinkKey, string[]> = {
  github: ['github.com', 'www.github.com'],
  linkedin: ['linkedin.com', 'www.linkedin.com', 'lnkd.in'],
  instagram: ['instagram.com', 'www.instagram.com'],
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  website: [],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
  website_2: [],
  website_3: [],
  contact_email: [],
}

function toCanonicalUrl(url: URL): string {
  const protocol = url.protocol.toLowerCase()
  const host = url.host.toLowerCase()
  const trimmedPathname = url.pathname.endsWith('/') && url.pathname !== '/'
    ? url.pathname.slice(0, -1)
    : url.pathname
  const path = trimmedPathname === '/' ? '' : trimmedPathname
  return `${protocol}//${host}${path}${url.search}`
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value: string): string | null {
  const lowered = value.trim().toLowerCase()
  if (!lowered) {
    return null
  }
  return EMAIL_REGEX.test(lowered) ? lowered : null
}

function parseUrlWithHttpsFallback(value: string): URL | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    return new URL(trimmed)
  } catch {
    try {
      return new URL(`https://${trimmed}`)
    } catch {
      return null
    }
  }
}

function normalizeSingleSocialLink(
  key: SocialLinkKey,
  value: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return { ok: true, value: null }
  }

  if (typeof value !== 'string') {
    return { ok: false, error: `${key} must be a string URL` }
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return { ok: true, value: null }
  }

  if (key === 'contact_email') {
    const normalizedEmail = normalizeEmail(trimmed)
    if (!normalizedEmail) {
      return { ok: false, error: `${key} must be a valid email address` }
    }
    return { ok: true, value: normalizedEmail }
  }

  const parsed = parseUrlWithHttpsFallback(trimmed)
  if (!parsed) {
    return { ok: false, error: `${key} must be a valid URL` }
  }

  if (parsed.protocol.toLowerCase() !== 'https:') {
    return { ok: false, error: `${key} must use https` }
  }

  const allowedHosts = HOST_ALLOWLIST[key]
  const host = parsed.hostname.toLowerCase()
  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    return { ok: false, error: `${key} URL must use an approved domain` }
  }

  parsed.hash = ''
  return { ok: true, value: toCanonicalUrl(parsed) }
}

function objectFromUnknown(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

export function collectSocialLinksCandidate(body: Record<string, unknown>): {
  provided: boolean
  candidate: Record<string, unknown>
} {
  const candidate: Record<string, unknown> = {}
  let provided = false

  if (body.social_links !== undefined) {
    provided = true
    const fromSocialLinks = objectFromUnknown(body.social_links)
    if (fromSocialLinks) {
      Object.assign(candidate, fromSocialLinks)
    } else {
      candidate.__invalid_social_links_shape = body.social_links
    }
  }

  for (const [field, key] of Object.entries(LEGACY_FIELD_TO_KEY) as Array<[keyof DbSocialColumns, SocialLinkKey]>) {
    if (body[field] !== undefined) {
      provided = true
      candidate[key] = body[field]
    }
  }

  return { provided, candidate }
}

export function validateAndNormalizeSocialLinks(candidate: Record<string, unknown>): SocialLinksResult {
  if ('__invalid_social_links_shape' in candidate) {
    return { ok: false, errors: ['social_links must be an object'] }
  }

  const errors: string[] = []
  const normalized: SocialLinks = {}

  for (const key of Object.keys(candidate)) {
    if (!SOCIAL_LINK_KEYS.includes(key as SocialLinkKey)) {
      errors.push(`Unsupported social_links key: ${key}`)
      continue
    }
  }

  for (const key of SOCIAL_LINK_KEYS) {
    if (!(key in candidate)) {
      continue
    }

    const normalizedValue = normalizeSingleSocialLink(key, candidate[key])
    if (!normalizedValue.ok) {
      errors.push(normalizedValue.error)
      continue
    }

    if (normalizedValue.value) {
      normalized[key] = normalizedValue.value
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, data: normalized }
}

export function socialLinksToDbColumns(links: SocialLinks): DbSocialColumns {
  return {
    github_url: links.github || null,
    linkedin_url: links.linkedin || null,
    instagram_url: links.instagram || null,
    youtube_url: links.youtube || null,
    website_url: links.website || null,
  }
}

function readSocialLinksObject(input: unknown): Record<string, unknown> {
  return objectFromUnknown(input) || {}
}

interface CoerceSocialLinksOptions {
  includePrivate?: boolean
}

export function coerceSocialLinksFromRow(row: {
  social_links?: unknown
  github_url?: unknown
  linkedin_url?: unknown
  instagram_url?: unknown
  youtube_url?: unknown
  website_url?: unknown
}, options: CoerceSocialLinksOptions = {}): SocialLinks {
  const candidate = readSocialLinksObject(row.social_links)

  for (const [field, key] of Object.entries(LEGACY_FIELD_TO_KEY) as Array<[keyof DbSocialColumns, SocialLinkKey]>) {
    if (!(key in candidate) && row[field] !== undefined) {
      candidate[key] = row[field]
    }
  }

  const normalized: SocialLinks = {}
  const keysToInclude: ReadonlyArray<SocialLinkKey> = options.includePrivate
    ? SOCIAL_LINK_KEYS
    : (PUBLIC_SOCIAL_LINK_KEYS as ReadonlyArray<SocialLinkKey>)

  for (const key of keysToInclude) {
    if (!(key in candidate)) {
      continue
    }

    const maybe = normalizeSingleSocialLink(key, candidate[key])
    if (maybe.ok && maybe.value) {
      normalized[key] = maybe.value
    }
  }

  return normalized
}
