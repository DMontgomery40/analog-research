import { describe, expect, it } from 'vitest'

import {
  collectSocialLinksCandidate,
  coerceSocialLinksFromRow,
  socialLinksToDbColumns,
  validateAndNormalizeSocialLinks,
} from '@/lib/social-links'

describe('social-links', () => {
  it('validates and normalizes known social link keys', () => {
    const result = validateAndNormalizeSocialLinks({
      github: 'https://github.com/octocat/',
      linkedin: 'https://www.linkedin.com/in/octocat',
      instagram: 'https://instagram.com/octo_creator',
      youtube: 'https://youtu.be/abc123',
      website: 'https://octo.example/',
      x: 'https://x.com/octocat/',
      website_2: 'ragweld.com',
      website_3: 'https://analog-research.org/',
      contact_email: 'DMontg@GMAIL.COM',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data).toEqual({
      github: 'https://github.com/octocat',
      linkedin: 'https://www.linkedin.com/in/octocat',
      instagram: 'https://instagram.com/octo_creator',
      youtube: 'https://youtu.be/abc123',
      website: 'https://octo.example',
      x: 'https://x.com/octocat',
      website_2: 'https://ragweld.com',
      website_3: 'https://analog-research.org',
      contact_email: 'dmontg@gmail.com',
    })
  })

  it('rejects non-https social links', () => {
    const result = validateAndNormalizeSocialLinks({
      github: 'http://github.com/octocat',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toContain('https')
  })

  it('rejects wrong domains for fixed platforms', () => {
    const result = validateAndNormalizeSocialLinks({
      github: 'https://linkedin.com/in/not-github',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toContain('approved domain')
  })

  it('rejects invalid x domains', () => {
    const result = validateAndNormalizeSocialLinks({
      x: 'https://notx.example.com/account',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toContain('approved domain')
  })

  it('rejects invalid contact_email values', () => {
    const result = validateAndNormalizeSocialLinks({
      contact_email: 'not-an-email',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toContain('valid email')
  })

  it('rejects unknown social_links keys', () => {
    const result = validateAndNormalizeSocialLinks({
      bluesky: 'https://bsky.app/profile/octocat',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toContain('Unsupported social_links key')
  })

  it('collects candidate links from canonical and legacy fields', () => {
    const candidate = collectSocialLinksCandidate({
      social_links: { github: 'https://github.com/octocat' },
      website_url: 'https://octo.example',
    })

    expect(candidate.provided).toBe(true)
    expect(candidate.candidate).toEqual({
      github: 'https://github.com/octocat',
      website: 'https://octo.example',
    })
  })

  it('coerces social links from row with column fallback', () => {
    const links = coerceSocialLinksFromRow({
      social_links: { github: 'https://github.com/octocat', contact_email: 'dmontg@gmail.com' },
      website_url: 'https://octo.example/',
    })

    expect(links).toEqual({
      github: 'https://github.com/octocat',
      website: 'https://octo.example',
    })
  })

  it('can include private social links when explicitly requested', () => {
    const links = coerceSocialLinksFromRow({
      social_links: { github: 'https://github.com/octocat', contact_email: 'dmontg@gmail.com' },
    }, { includePrivate: true })

    expect(links).toEqual({
      github: 'https://github.com/octocat',
      contact_email: 'dmontg@gmail.com',
    })
  })

  it('maps normalized links to db mirror columns', () => {
    const columns = socialLinksToDbColumns({
      github: 'https://github.com/octocat',
      website: 'https://octo.example',
    })

    expect(columns).toEqual({
      github_url: 'https://github.com/octocat',
      linkedin_url: null,
      instagram_url: null,
      youtube_url: null,
      website_url: 'https://octo.example',
    })
  })
})
