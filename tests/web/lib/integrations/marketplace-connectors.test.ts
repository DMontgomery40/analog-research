import { describe, expect, it } from 'vitest'

import {
  formatMarketplaceConnectorStatus,
  listRaisedHandMarketplaceConnectors,
  RAISED_HAND_MARKETPLACE_CONNECTORS,
} from '@/lib/integrations/marketplace-connectors'

describe('raised-hand marketplace connectors', () => {
  it('includes the current connector roadmap set', () => {
    const ids = RAISED_HAND_MARKETPLACE_CONNECTORS.map((connector) => connector.id)

    expect(ids).toEqual(['analoglabor', 'proxypics', 'upwork', 'thumbtack', 'taskrabbit', 'fiverr'])
  })

  it('enforces no cold outreach semantics for every connector', () => {
    for (const connector of RAISED_HAND_MARKETPLACE_CONNECTORS) {
      expect(connector.supportsColdOutreach).toBe(false)
    }
  })

  it('sorts live connectors ahead of onboarding and research', () => {
    const sorted = listRaisedHandMarketplaceConnectors()

    expect(sorted[0]?.status).toBe('live')
    expect(sorted.map((connector) => connector.status)).toEqual([
      'live',
      'live',
      'partner_onboarding',
      'partner_onboarding',
      'partner_onboarding',
      'researching',
    ])
  })

  it('formats status labels for UI badges', () => {
    expect(formatMarketplaceConnectorStatus('live')).toBe('Live')
    expect(formatMarketplaceConnectorStatus('partner_onboarding')).toBe('Partner Onboarding')
    expect(formatMarketplaceConnectorStatus('researching')).toBe('Researching')
  })
})
