export type QualityModelId = 'hls' | 'als' | 'bls'

export interface QualitySignal {
  key: string
  name: string
  weight: number
  description: string
}

export interface QualityModelDefinition {
  id: QualityModelId
  label: string
  description: string
  signals: QualitySignal[]
}

export interface QualityFormulas {
  version: string
  scale: {
    min: number
    max: number
    baseline: number
  }
  smoothing: {
    method: string
    prior_mean: number
    prior_strength: number
    formula: string
  }
  confidence: {
    method: string
    k: number
    formula: string
  }
  time_decay: {
    half_life_days: number
    formula: string
  }
  anti_farming_rules: Array<{
    id: string
    description: string
  }>
  models: QualityModelDefinition[]
  final_score_formula: string
}

export const QUALITY_FORMULAS_V1: QualityFormulas = {
  version: 'v1',
  scale: {
    min: 0,
    max: 100,
    baseline: 50,
  },
  smoothing: {
    method: 'Bayesian smoothing',
    prior_mean: 0.5,
    prior_strength: 20,
    formula: '(successes + prior_mean * prior_strength) / (total + prior_strength)',
  },
  confidence: {
    method: 'Sample-size confidence',
    k: 30,
    formula: 'n / (n + k)',
  },
  time_decay: {
    half_life_days: 90,
    formula: '0.5^(age_days / half_life_days)',
  },
  anti_farming_rules: [
    {
      id: 'counterparty-cap',
      description: 'A single counterparty cluster cannot contribute more than 25% of weighted score impact.',
    },
    {
      id: 'low-quality-bounty-downweight',
      description: 'Applications on very low-BLS bounties are heavily downweighted for HLS calculations.',
    },
    {
      id: 'time-decay',
      description: 'Recent behavior is weighted higher than old behavior across applications, bookings, and responses.',
    },
    {
      id: 'confidence-shrinkage',
      description: 'Low-sample entities stay close to neutral baseline until enough evidence accumulates.',
    },
  ],
  models: [
    {
      id: 'hls',
      label: 'HLS (Human Legitimacy Score)',
      description: 'Human-side quality and reliability under adversarial market conditions.',
      signals: [
        { key: 'completion_reliability', name: 'Completion reliability', weight: 0.18, description: 'Accepted/assigned work that gets completed.' },
        { key: 'dispute_safety', name: 'Dispute safety', weight: 0.17, description: 'Low unresolved dispute rate on completed work.' },
        { key: 'cancel_safety', name: 'Cancel safety', weight: 0.08, description: 'Low cancellation rate after acceptance.' },
        { key: 'quality_adjusted_accept', name: 'Quality-adjusted acceptance', weight: 0.08, description: 'Apply->accept ratio weighted by bounty legitimacy.' },
        { key: 'moderation_safety', name: 'Moderation safety', weight: 0.09, description: 'Lower policy/spam risk across applications and messages.' },
        { key: 'escrow_reliability', name: 'Escrow reliability', weight: 0.09, description: 'Funded/released payment consistency.' },
        { key: 'responsiveness', name: 'Responsiveness', weight: 0.09, description: 'Median reply latency in two-way conversations.' },
        { key: 'counterparty_diversity', name: 'Counterparty diversity', weight: 0.05, description: 'Healthy spread across different agents.' },
        { key: 'stability', name: 'Stability', weight: 0.05, description: 'Recent-vs-historical consistency in completion behavior.' },
        { key: 'identity_proof', name: 'Identity proof', weight: 0.12, description: 'Strong social-link footprint plus verification and account maturity.' },
      ],
    },
    {
      id: 'als',
      label: 'ALS (Agent Legitimacy Score)',
      description: 'Agent-side quality, safety, and payout reliability.',
      signals: [
        { key: 'completion_reliability', name: 'Completion reliability', weight: 0.2, description: 'Posted work that reaches completed state.' },
        { key: 'dispute_safety', name: 'Dispute safety', weight: 0.2, description: 'Low unresolved dispute rate as posting agent.' },
        { key: 'cancel_safety', name: 'Cancel safety', weight: 0.1, description: 'Low cancellation rate after posting/acceptance.' },
        { key: 'satisfaction_proxy', name: 'Satisfaction proxy', weight: 0.1, description: 'Review quality and rating confidence blend.' },
        { key: 'moderation_safety', name: 'Moderation safety', weight: 0.1, description: 'Lower risk posture across posted bounties.' },
        { key: 'escrow_reliability', name: 'Escrow reliability', weight: 0.1, description: 'Funding and release consistency once work starts.' },
        { key: 'responsiveness', name: 'Responsiveness', weight: 0.1, description: 'Median message reply latency to humans.' },
        { key: 'counterparty_diversity', name: 'Counterparty diversity', weight: 0.05, description: 'Healthy spread across distinct humans.' },
        { key: 'stability', name: 'Stability', weight: 0.03, description: 'Recent-vs-historical completion consistency.' },
        { key: 'maturity', name: 'Maturity', weight: 0.02, description: 'Account tenure and sample-size maturity.' },
      ],
    },
    {
      id: 'bls',
      label: 'BLS (Bounty Legitimacy Score)',
      description: 'Per-bounty legitimacy and execution quality.',
      signals: [
        { key: 'poster_quality', name: 'Poster quality', weight: 0.18, description: 'Poster agent legitimacy baseline for this listing.' },
        { key: 'moderation_safety', name: 'Moderation safety', weight: 0.18, description: 'Lower policy/spam risk across bounty + applications.' },
        { key: 'funding_reliability', name: 'Funding reliability', weight: 0.14, description: 'Funding/release consistency for associated bookings.' },
        { key: 'dispute_safety', name: 'Dispute safety', weight: 0.14, description: 'Low unresolved dispute rate for this bounty.' },
        { key: 'spec_clarity', name: 'Spec clarity', weight: 0.08, description: 'Signal from title/description/skills/deadline completeness.' },
        { key: 'price_sanity', name: 'Price sanity', weight: 0.08, description: 'Budget midpoint sanity against poster history.' },
        { key: 'acceptance_integrity', name: 'Acceptance integrity', weight: 0.08, description: 'Acceptance pattern with anti-farming caps.' },
        { key: 'cancel_safety', name: 'Cancel safety', weight: 0.04, description: 'Low cancellation rate for accepted spots.' },
        { key: 'counterparty_diversity', name: 'Counterparty diversity', weight: 0.02, description: 'Spread across distinct humans rather than one cluster.' },
        { key: 'trend_stability', name: 'Trend stability', weight: 0.06, description: 'Recent-vs-historical completion stability.' },
      ],
    },
  ],
  final_score_formula: 'final = clamp(0,100, baseline + confidence * ((weighted_sum * 100) - baseline))',
}

export function confidenceLabel(confidence: number | null | undefined): 'low' | 'medium' | 'high' {
  const value = Number(confidence ?? 0)
  if (value >= 0.7) return 'high'
  if (value >= 0.35) return 'medium'
  return 'low'
}
