import { describe, expect, it } from 'vitest'
import { QUALITY_FORMULAS_V1, confidenceLabel } from '@/lib/quality-formulas'

describe('QUALITY_FORMULAS_V1', () => {
  it('exposes all three quality models with ten weighted signals each', () => {
    expect(QUALITY_FORMULAS_V1.models.map((model) => model.id)).toEqual(['hls', 'als', 'bls'])

    for (const model of QUALITY_FORMULAS_V1.models) {
      expect(model.signals).toHaveLength(10)

      const totalWeight = model.signals.reduce((sum, signal) => sum + signal.weight, 0)
      expect(totalWeight).toBeCloseTo(1, 10)
    }
  })

  it('includes anti-farming safeguards in the published contract', () => {
    const ruleIds = QUALITY_FORMULAS_V1.anti_farming_rules.map((rule) => rule.id)
    expect(ruleIds).toEqual(
      expect.arrayContaining([
        'counterparty-cap',
        'low-quality-bounty-downweight',
        'time-decay',
        'confidence-shrinkage',
      ])
    )
  })
})

describe('confidenceLabel', () => {
  it('maps numeric confidence to low/medium/high tiers', () => {
    expect(confidenceLabel(0.1)).toBe('low')
    expect(confidenceLabel(0.35)).toBe('medium')
    expect(confidenceLabel(0.69)).toBe('medium')
    expect(confidenceLabel(0.7)).toBe('high')
    expect(confidenceLabel(null)).toBe('low')
  })
})
