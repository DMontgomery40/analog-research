import { describe, expect, it } from 'vitest'

import {
  extractDomains,
  extractUrls,
  normalizeContent,
  runDeterministicRules,
} from '@/lib/moderation/policy'

describe('moderation policy helpers', () => {
  it('normalizes hidden unicode and whitespace', () => {
    const normalized = normalizeContent('hello\u200B   world\n\nfrom   analoglabor')

    expect(normalized).toBe('hello world from analoglabor')
  })

  it('extracts and de-duplicates urls', () => {
    const urls = extractUrls('Visit https://example.com and https://example.com and https://foo.bar/path')

    expect(urls).toEqual(['https://example.com', 'https://foo.bar/path'])
  })

  it('extracts canonical lowercased domains and skips invalid URLs', () => {
    const domains = extractDomains([
      'https://www.Example.com/path',
      'https://sub.example.com',
      'not-a-url',
    ])

    expect(domains).toEqual(['example.com', 'sub.example.com'])
  })

  it('hard-fails explicit private key requests', () => {
    const result = runDeterministicRules('Send your seed phrase and private key so we can recover your wallet.')

    expect(result.hardFail).toBe(true)
    expect(result.warning).toBe(false)
    expect(result.reasonCodes).toContain('SEED_OR_PRIVATE_KEY_REQUEST')
    expect(result.riskScore).toBeGreaterThanOrEqual(0.98)
    expect(result.confidence).toBeGreaterThanOrEqual(0.99)
  })

  it('hard-fails high-confidence upfront-payment deception', () => {
    const result = runDeterministicRules('Pay first deposit now and then we will pay 150% guaranteed profit.')

    expect(result.hardFail).toBe(true)
    expect(result.reasonCodes).toContain('UPFRONT_PAYMENT_DECEPTION_HIGH_CONFIDENCE')
  })

  it('warns on suspicious off-platform and link patterns', () => {
    const result = runDeterministicRules('Urgent: move off-platform to Telegram now: https://suspicious.example/click')

    expect(result.hardFail).toBe(false)
    expect(result.warning).toBe(true)
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'OFF_PLATFORM_REDIRECT_REQUEST',
      'SUSPICIOUS_EXTERNAL_LINK',
      'SOCIAL_ENGINEERING_PATTERN_LOW_CONFIDENCE',
    ]))
  })

  it('returns clean decision for benign content', () => {
    const result = runDeterministicRules('Need QA testing for our signup flow. Deliver notes in 24 hours.')

    expect(result.hardFail).toBe(false)
    expect(result.warning).toBe(false)
    expect(result.reasonCodes).toEqual([])
    expect(result.summary).toBe('No deterministic policy hits.')
  })
})
