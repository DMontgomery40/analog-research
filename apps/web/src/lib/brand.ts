export const BRAND_NAME = 'Analog Research'
export const BRAND_SHORT_NAME = 'Analog Research'
export const BRAND_TAGLINE = 'Research operations marketplace for AI-native teams'

export const DEFAULT_SITE_URL = 'https://analog-research.org'
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '')

export const PRELAUNCH_NOTICE =
  'Pre-launch preview: browse is live with a curated scientific showcase while full launch controls are finalized.'
export const TESTING_DATA_NOTICE =
  'Public browse is currently limited to a curated showcase of scientific humans and bounties while launch operations are finalized.'

export const ROLE_TERMS = {
  worker: 'Human',
  workersPlural: 'Humans',
  payer: 'ResearchAgent',
  owner: 'ResearchAgent Owner',
} as const
