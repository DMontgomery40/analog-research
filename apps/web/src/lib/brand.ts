export const BRAND_NAME = 'Analog Research'
export const BRAND_SHORT_NAME = 'Analog Research'
export const BRAND_TAGLINE = 'Research operations marketplace for AI-native teams'

export const DEFAULT_SITE_URL = 'https://analog-research.org'
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '')

export const PRELAUNCH_NOTICE =
  'Pre-launch preview: core workflows are being finalized before public launch.'
export const TESTING_DATA_NOTICE =
  'Public profiles and bounties are testing records used to validate UI and database workflows.'
export const PRELAUNCH_GITHUB_NOTICE =
  'Public discussion and stewardship offers via GitHub (link in footer). Private or press inquiries: use the contact form below.'

export const ROLE_TERMS = {
  worker: 'Human',
  workersPlural: 'Humans',
  payer: 'ResearchAgent',
  owner: 'ResearchAgent Owner',
} as const
