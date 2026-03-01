import { describe, expect, it } from 'vitest'

import { assessLinkRisk } from '@/lib/moderation/link-risk'

interface CacheRow {
  verdict: string
  confidence: number
  reason_codes: string[]
  expires_at: string
  domain: string
}

class FakeLinkRiskSupabase {
  readonly upserts: Array<Record<string, unknown>> = []

  constructor(private readonly cacheByCanonicalUrl: Map<string, CacheRow>) {}

  from(_table: string) {
    return new FakeLinkRiskQuery(this.cacheByCanonicalUrl, this.upserts)
  }
}

class FakeLinkRiskQuery {
  private canonicalUrl: string | null = null

  constructor(
    private readonly cacheByCanonicalUrl: Map<string, CacheRow>,
    private readonly upserts: Array<Record<string, unknown>>,
  ) {}

  select(_columns: string) {
    return this
  }

  eq(column: string, value: unknown) {
    if (column === 'canonical_url') {
      this.canonicalUrl = String(value)
    }
    return this
  }

  gt(_column: string, _value: string) {
    return this
  }

  async maybeSingle(): Promise<{ data: CacheRow | null }> {
    if (!this.canonicalUrl) {
      return { data: null }
    }

    return {
      data: this.cacheByCanonicalUrl.get(this.canonicalUrl) || null,
    }
  }

  async upsert(payload: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> {
    this.upserts.push(payload)
    return { data: payload }
  }
}

describe('link-risk assessment', () => {
  it('returns a clean result when no URLs are present', async () => {
    const supabase = new FakeLinkRiskSupabase(new Map())

    const result = await assessLinkRisk('No links here, just task details.', supabase as never)

    expect(result.reasonCodes).toEqual([])
    expect(result.riskScore).toBe(0)
    expect(result.confidence).toBe(0)
    expect(result.evidence).toEqual({ urls: [] })
  })

  it('flags suspicious domains and high-risk URL paths', async () => {
    const supabase = new FakeLinkRiskSupabase(new Map())

    const result = await assessLinkRisk(
      'Use this login flow: https://wallet-login.example.xyz/verify?token=abc',
      supabase as never,
    )

    expect(result.reasonCodes).toContain('SUSPICIOUS_EXTERNAL_LINK')
    expect(result.riskScore).toBeGreaterThanOrEqual(0.6)
    expect(result.confidence).toBeGreaterThanOrEqual(0.64)
    expect(result.evidence).toEqual(expect.objectContaining({
      suspiciousDomains: ['wallet-login.example.xyz'],
      cacheHits: 0,
    }))

    expect(supabase.upserts).toHaveLength(1)
    expect(supabase.upserts[0]).toEqual(expect.objectContaining({
      domain: 'wallet-login.example.xyz',
      verdict: 'warn',
      reason_codes: ['SUSPICIOUS_EXTERNAL_LINK'],
    }))
  })

  it('uses cached warn verdicts and skips duplicate cache writes', async () => {
    const cachedUrl = 'https://example.com/login?token=1'

    const supabase = new FakeLinkRiskSupabase(new Map([
      [cachedUrl, {
        verdict: 'warn',
        confidence: 0.91,
        reason_codes: ['SUSPICIOUS_EXTERNAL_LINK'],
        expires_at: '2099-01-01T00:00:00.000Z',
        domain: 'example.com',
      }],
    ]))

    const result = await assessLinkRisk(`Please verify at ${cachedUrl}`, supabase as never)

    expect(result.reasonCodes).toEqual(['SUSPICIOUS_EXTERNAL_LINK'])
    expect(result.riskScore).toBe(0.91)
    expect(result.confidence).toBe(0.91)
    expect(result.evidence).toEqual(expect.objectContaining({
      cacheHits: 1,
    }))
    expect(supabase.upserts).toEqual([])
  })

  it('flags suspicious TLDs (.xyz, .click, .zip, etc.)', async () => {
    const supabase = new FakeLinkRiskSupabase(new Map())

    const result = await assessLinkRisk(
      'Check this site: https://free-money.xyz/claim',
      supabase as never,
    )

    expect(result.reasonCodes).toContain('SUSPICIOUS_EXTERNAL_LINK')
    expect(result.riskScore).toBeGreaterThanOrEqual(0.52)
    expect((result.evidence as { suspiciousDomains: string[] }).suspiciousDomains).toContain('free-money.xyz')
  })

  it('flags punycode domains (homograph attacks)', async () => {
    const supabase = new FakeLinkRiskSupabase(new Map())

    const result = await assessLinkRisk(
      'Visit https://xn--pple-43d.com/account',
      supabase as never,
    )

    expect(result.reasonCodes).toContain('SUSPICIOUS_EXTERNAL_LINK')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
  })

  it('flags URLs with @ symbol (URL obfuscation)', async () => {
    const supabase = new FakeLinkRiskSupabase(new Map())

    const result = await assessLinkRisk(
      'Login here: https://legitimate-site.com@malicious.com/phish',
      supabase as never,
    )

    expect(result.reasonCodes).toContain('SUSPICIOUS_EXTERNAL_LINK')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
  })

  it('flags high-risk path patterns (wallet, seed, auth, token)', async () => {
    const supabase = new FakeLinkRiskSupabase(new Map())

    const resultSeed = await assessLinkRisk(
      'Enter your seed phrase at https://support.example.com/seed-recovery',
      supabase as never,
    )
    expect(resultSeed.reasonCodes).toContain('SUSPICIOUS_EXTERNAL_LINK')

    const resultPrivateKey = await assessLinkRisk(
      'Import your wallet: https://app.example.com/private_key',
      supabase as never,
    )
    expect(resultPrivateKey.reasonCodes).toContain('SUSPICIOUS_EXTERNAL_LINK')
  })

  it('allows clean URLs from known safe domains', async () => {
    const supabase = new FakeLinkRiskSupabase(new Map())

    const result = await assessLinkRisk(
      'Check our docs at https://docs.analoglabor.com/getting-started',
      supabase as never,
    )

    // Should not flag as high risk (though any external link gets base assessment)
    expect(result.riskScore).toBeLessThan(0.7)
    expect((result.evidence as { suspiciousDomains: string[] }).suspiciousDomains).toHaveLength(0)
  })
})
