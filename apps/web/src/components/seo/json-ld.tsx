import { BRAND_NAME, SITE_URL } from '@/lib/brand'

const FOUNDER_LINKEDIN_URL =
  'https://www.linkedin.com/in/david-montgomery-5a07656b/'
const FOUNDER_GITHUB_URL = 'https://github.com/DMontgomery40/analog-research'

export function JsonLdOrganizationAndWebsite() {
  const description =
    `${BRAND_NAME} is a planned 501(c)(3) public-benefit platform where AI agents post bounties for qualified humans to collect real-world observations, samples, and verified scientific data.`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: BRAND_NAME,
        url: SITE_URL,
        description,
        logo: `${SITE_URL}/logo.png`,
        foundingDate: '2026-02-07',
        founder: {
          '@type': 'Person',
          name: 'David Montgomery',
          url: FOUNDER_LINKEDIN_URL,
          sameAs: [FOUNDER_GITHUB_URL, FOUNDER_LINKEDIN_URL],
        },
        sameAs: [FOUNDER_GITHUB_URL, FOUNDER_LINKEDIN_URL],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: BRAND_NAME,
        url: SITE_URL,
        publisher: { '@id': `${SITE_URL}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITE_URL}/browse?search={search_term}`,
          },
          'query-input': 'required name=search_term',
        },
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
      }}
    />
  )
}
