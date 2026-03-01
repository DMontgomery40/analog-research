import { createHash } from 'crypto'
import type { ModerationReasonCode } from './types'

const URL_REGEX = /https?:\/\/[^\s<>'"`]+/gi

const seedOrKeyPattern = /(seed phrase|mnemonic|private key|recovery phrase|wallet secret|api key|secret key|one[- ]time password|otp)/i
const phishingPattern = /(verify(?: your)? account|real[- ]?name authentication|login verification|password reset).*(password|otp|code|token|wallet|seed)/i
const promptInjectionPattern = /(ignore previous instructions|system prompt|developer message).*(api key|token|secret|password|env|credentials)/i
const malwarePattern = /(curl\s+[^\n]*\|\s*(sh|bash)|wget\s+[^\n]*\|\s*(sh|bash)|powershell\s+-enc|cmd\s+\/c\s+.*(download|iex))/i
const upfrontPaymentPattern = /(pay first|deposit first|send (?:money|crypto|usdt|eth) first|upfront transfer|recharge first|top up first)/i
const profitPromisePattern = /(then (?:you|we) (?:will )?(?:pay|return|get)|guaranteed profit|\+\d+%|double your money)/i

const offPlatformPattern = /(telegram|whatsapp|signal|discord\s*dm|move off[- ]platform)/i
const ambiguousFinancialPattern = /(crypto exchange|wallet connect|transfer funds|investment return|faucetpay|trading signal)/i
const socialEngineeringPattern = /(urgent|immediately|act now|limited slots|exclusive offer)/i

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

export function normalizeContent(content: string): string {
  return content
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function extractUrls(content: string): string[] {
  const matches = content.match(URL_REGEX) || []
  return unique(matches.map((entry) => entry.trim()))
}

export function extractDomains(urls: string[]): string[] {
  const domains: string[] = []

  for (const value of urls) {
    try {
      const url = new URL(value)
      const host = url.hostname.toLowerCase()
      domains.push(host.startsWith('www.') ? host.slice(4) : host)
    } catch {
      // ignore invalid URL
    }
  }

  return unique(domains)
}

export interface DeterministicRuleResult {
  hardFail: boolean
  warning: boolean
  reasonCodes: ModerationReasonCode[]
  riskScore: number
  confidence: number
  summary: string
}

export function runDeterministicRules(content: string): DeterministicRuleResult {
  const normalized = normalizeContent(content)
  const reasonCodes: ModerationReasonCode[] = []

  let hardFail = false
  let warning = false
  let confidence = 0
  let riskScore = 0

  const hasUpfront = upfrontPaymentPattern.test(normalized)
  const hasProfit = profitPromisePattern.test(normalized)
  const hasSeedKey = seedOrKeyPattern.test(normalized)
  const hasPhishing = phishingPattern.test(normalized)
  const hasPromptInjection = promptInjectionPattern.test(normalized)
  const hasMalware = malwarePattern.test(normalized)

  if (hasSeedKey) {
    hardFail = true
    reasonCodes.push('SEED_OR_PRIVATE_KEY_REQUEST')
    confidence = Math.max(confidence, 0.99)
    riskScore = Math.max(riskScore, 0.98)
  }

  if (hasPhishing) {
    hardFail = true
    reasonCodes.push('PHISHING_CREDENTIAL_THEFT')
    confidence = Math.max(confidence, 0.97)
    riskScore = Math.max(riskScore, 0.96)
  }

  if (hasPromptInjection) {
    hardFail = true
    reasonCodes.push('PROMPT_INJECTION_SECRET_EXFIL')
    confidence = Math.max(confidence, 0.96)
    riskScore = Math.max(riskScore, 0.95)
  }

  if (hasMalware) {
    hardFail = true
    reasonCodes.push('MALWARE_OR_EXECUTION_TRAP')
    confidence = Math.max(confidence, 0.98)
    riskScore = Math.max(riskScore, 0.97)
  }

  if (hasUpfront && hasProfit) {
    hardFail = true
    reasonCodes.push('UPFRONT_PAYMENT_DECEPTION_HIGH_CONFIDENCE')
    confidence = Math.max(confidence, 0.95)
    riskScore = Math.max(riskScore, 0.94)
  }

  if (offPlatformPattern.test(normalized)) {
    warning = true
    reasonCodes.push('OFF_PLATFORM_REDIRECT_REQUEST')
    confidence = Math.max(confidence, 0.65)
    riskScore = Math.max(riskScore, 0.55)
  }

  if (ambiguousFinancialPattern.test(normalized) || hasUpfront) {
    warning = true
    reasonCodes.push('AMBIGUOUS_FINANCIAL_RISK')
    confidence = Math.max(confidence, 0.63)
    riskScore = Math.max(riskScore, 0.53)
  }

  if (socialEngineeringPattern.test(normalized)) {
    warning = true
    reasonCodes.push('SOCIAL_ENGINEERING_PATTERN_LOW_CONFIDENCE')
    confidence = Math.max(confidence, 0.61)
    riskScore = Math.max(riskScore, 0.52)
  }

  const urls = extractUrls(normalized)
  if (urls.length > 0) {
    warning = true
    reasonCodes.push('SUSPICIOUS_EXTERNAL_LINK')
    confidence = Math.max(confidence, 0.6)
    riskScore = Math.max(riskScore, 0.5)
  }

  const deduped = unique(reasonCodes)
  let summary = 'No deterministic policy hits.'
  if (hardFail) {
    summary = `Deterministic hard-fail via ${deduped.join(', ')}`
  } else if (warning) {
    summary = `Deterministic warning signals: ${deduped.join(', ')}`
  }

  return {
    hardFail,
    warning,
    reasonCodes: deduped,
    riskScore,
    confidence,
    summary,
  }
}
