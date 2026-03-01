import { extractDomains } from './policy'
import type { ModerationReasonCode } from './types'

interface LinkRiskResult {
  reasonCodes: ModerationReasonCode[]
  riskScore: number
  confidence: number
  evidence: Record<string, unknown>
}

const SUSPICIOUS_TLDS = new Set(['top', 'xyz', 'click', 'zip', 'mov', 'quest', 'cam'])
const HIGH_RISK_PATH_PATTERN = /(verify|wallet|auth|login|seed|private[-_]?key|token)/i

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function parseUrls(content: string): string[] {
  return [...new Set((content.match(/https?:\/\/[^\s<>'"`]+/gi) || []).map((url) => url.trim()))]
}

function canonicalize(url: string): string | null {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return null
  }
}

export async function assessLinkRisk(
  content: string,
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServiceClient>>,
): Promise<LinkRiskResult> {
  const urls = parseUrls(content)

  if (urls.length === 0) {
    return {
      reasonCodes: [],
      riskScore: 0,
      confidence: 0,
      evidence: { urls: [] },
    }
  }

  const reasonCodes: ModerationReasonCode[] = ['SUSPICIOUS_EXTERNAL_LINK']
  let riskScore = 0.52
  let confidence = 0.62

  const domains = extractDomains(urls)
  const suspiciousDomains: string[] = []
  const cached: Array<Record<string, unknown>> = []

  for (const raw of urls) {
    const canonical = canonicalize(raw)
    if (!canonical) continue

    const { data: cacheHit } = await supabase
      .from('link_risk_cache')
      .select('verdict, confidence, reason_codes, expires_at, domain')
      .eq('canonical_url', canonical)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (cacheHit) {
      cached.push(cacheHit)
      const verdict = cacheHit.verdict as string
      if (verdict === 'warn' || verdict === 'fail') {
        reasonCodes.push('SUSPICIOUS_EXTERNAL_LINK')
        riskScore = Math.max(riskScore, Number(cacheHit.confidence ?? 0.62))
        confidence = Math.max(confidence, Number(cacheHit.confidence ?? 0.62))
      }
      continue
    }

    try {
      const parsed = new URL(canonical)
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
      const tld = host.split('.').pop() || ''

      let verdict: 'allow' | 'warn' = 'allow'
      const hitReasons: string[] = []
      let itemConfidence = 0.2

      if (host.includes('xn--')) {
        verdict = 'warn'
        hitReasons.push('punycode_domain')
        itemConfidence = Math.max(itemConfidence, 0.7)
      }

      if (SUSPICIOUS_TLDS.has(tld)) {
        verdict = 'warn'
        hitReasons.push('suspicious_tld')
        itemConfidence = Math.max(itemConfidence, 0.67)
      }

      if (HIGH_RISK_PATH_PATTERN.test(parsed.pathname + parsed.search)) {
        verdict = 'warn'
        hitReasons.push('high_risk_path_pattern')
        itemConfidence = Math.max(itemConfidence, 0.64)
      }

      if (raw.includes('@')) {
        verdict = 'warn'
        hitReasons.push('at_symbol_in_url')
        itemConfidence = Math.max(itemConfidence, 0.7)
      }

      if (verdict === 'warn') {
        suspiciousDomains.push(host)
        reasonCodes.push('SUSPICIOUS_EXTERNAL_LINK')
        riskScore = Math.max(riskScore, 0.6)
        confidence = Math.max(confidence, itemConfidence)
      }

      await supabase
        .from('link_risk_cache')
        .upsert({
          canonical_url: canonical,
          domain: host,
          verdict,
          confidence: itemConfidence,
          reason_codes: verdict === 'warn' ? ['SUSPICIOUS_EXTERNAL_LINK'] : [],
          provider: 'heuristic',
          metadata: { hit_reasons: hitReasons },
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
        }, { onConflict: 'canonical_url' })
    } catch {
      // ignore URL parse failure
    }
  }

  return {
    reasonCodes: unique(reasonCodes),
    riskScore,
    confidence,
    evidence: {
      urls,
      domains,
      suspiciousDomains,
      cacheHits: cached.length,
    },
  }
}
