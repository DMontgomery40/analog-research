import { afterEach, describe, expect, it } from 'vitest'

import { moderationColumnsFromResult, toModerationResponse } from '@/lib/moderation/orchestrator'
import type { ModerationResult } from '@/lib/moderation/types'

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL

const baseResult: ModerationResult = {
  decision: 'warn',
  reasonCodes: ['SUSPICIOUS_EXTERNAL_LINK'],
  riskScore: 0.61,
  confidence: 0.72,
  spamAction: 'none',
  policyVersion: '2026-02-08-v1',
  provider: 'openrouter',
  model: 'meta-llama/llama-guard-3-8b',
  summary: 'Content allowed with warning signals.',
  needsRescan: false,
  timedOut: false,
  contentHash: 'hash-123',
  evidence: {
    urls: ['https://example.com'],
  },
}

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl
  }
})

describe('moderation orchestrator helpers', () => {
  it('maps moderation columns for table updates', () => {
    const columns = moderationColumnsFromResult(baseResult)

    expect(columns.moderation_decision).toBe('warn')
    expect(columns.moderation_reason_codes).toEqual(['SUSPICIOUS_EXTERNAL_LINK'])
    expect(columns.moderation_risk_score).toBe(0.61)
    expect(columns.moderation_confidence).toBe(0.72)
    expect(columns.moderation_policy_version).toBe('2026-02-08-v1')
    expect(Number.isNaN(Date.parse(columns.moderation_updated_at))).toBe(false)
  })

  it('builds fail responses with an appeal url', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://analoglabor.com'

    const response = toModerationResponse(
      {
        ...baseResult,
        decision: 'fail',
        reasonCodes: ['SEED_OR_PRIVATE_KEY_REQUEST'],
        spamAction: 'block',
      },
      { contentType: 'booking', contentId: 'booking_123', decisionId: 'evt_1' },
    )

    expect(response.decision).toBe('fail')
    expect(response.appeal_url).toBe(
      'https://analoglabor.com/moderation/appeal?content_type=booking&content_id=booking_123&decision_id=evt_1',
    )
  })

  it('returns null appeal url for non-fail decisions', () => {
    const response = toModerationResponse(baseResult, {
      contentType: 'message',
      contentId: 'msg_1',
      decisionId: 'evt_2',
    })

    expect(response.decision).toBe('warn')
    expect(response.appeal_url).toBeNull()
  })
})
