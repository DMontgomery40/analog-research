const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REQUIRED_CURATED_COUNT = 3

export type PublicShowcaseMode = 'curated' | 'open'

export interface PublicShowcaseConfig {
  mode: PublicShowcaseMode
  humanIds: string[]
  bountyIds: string[]
}

function parseMode(rawMode: string | undefined): PublicShowcaseMode {
  const normalized = (rawMode || '').trim().toLowerCase()
  if (normalized === 'open' || normalized === 'off' || normalized === 'disabled' || normalized === 'all') {
    return 'open'
  }

  // Default to curated mode so public feeds fail closed by default.
  return 'curated'
}

function parseCsvUuids(rawIds: string | undefined): string[] {
  if (!rawIds) return []

  const seen = new Set<string>()
  for (const token of rawIds.split(',')) {
    const trimmed = token.trim()
    if (!trimmed || !UUID_REGEX.test(trimmed)) continue
    seen.add(trimmed)
  }

  return Array.from(seen)
}

export function getPublicShowcaseConfig(): PublicShowcaseConfig {
  return {
    mode: parseMode(process.env.PUBLIC_SHOWCASE_MODE),
    humanIds: parseCsvUuids(process.env.PUBLIC_SHOWCASE_HUMAN_IDS),
    bountyIds: parseCsvUuids(process.env.PUBLIC_SHOWCASE_BOUNTY_IDS),
  }
}

export function isPublicShowcaseCuratedMode(config = getPublicShowcaseConfig()): boolean {
  return config.mode === 'curated'
}

export function hasExactCuratedHumanIds(config = getPublicShowcaseConfig()): boolean {
  return config.humanIds.length === REQUIRED_CURATED_COUNT
}

export function hasExactCuratedBountyIds(config = getPublicShowcaseConfig()): boolean {
  return config.bountyIds.length === REQUIRED_CURATED_COUNT
}

export function shouldFailClosedPublicHumans(config = getPublicShowcaseConfig()): boolean {
  return isPublicShowcaseCuratedMode(config) && !hasExactCuratedHumanIds(config)
}

export function shouldFailClosedPublicBounties(config = getPublicShowcaseConfig()): boolean {
  return isPublicShowcaseCuratedMode(config) && !hasExactCuratedBountyIds(config)
}

export function isHumanPubliclyVisible(humanId: string, config = getPublicShowcaseConfig()): boolean {
  if (!isPublicShowcaseCuratedMode(config)) return true
  if (!hasExactCuratedHumanIds(config)) return false
  return config.humanIds.includes(humanId)
}

export function isBountyPubliclyVisible(bountyId: string, config = getPublicShowcaseConfig()): boolean {
  if (!isPublicShowcaseCuratedMode(config)) return true
  if (!hasExactCuratedBountyIds(config)) return false
  return config.bountyIds.includes(bountyId)
}
