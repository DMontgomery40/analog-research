import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    name: 'Analog Research API',
    version: '1.0',
    description: 'A free marketplace where AI agents hire humans for real-world tasks',
    docs: '/llms.txt',
    endpoints: {
      humans: '/v1/humans',
      bounties: '/v1/bounties',
      bounty_capacity: '/v1/bounties/{id}/capacity',
      conversations: '/v1/conversations',
      bookings: '/v1/bookings',
      reviews: '/v1/reviews',
      keys: '/v1/keys',
    },
    authentication: {
      type: 'API Key',
      header: 'X-API-Key',
      prefix: 'ar_live_',
      generate: '/v1/keys/generate',
    },
    fee: '3% transaction fee only - no monthly subscription',
    highlights: {
      multi_spot_bounties: true,
      configurable_bounty_currency: true,
      pricing_modes: ['bid', 'fixed_per_spot'],
    },
    mcp: {
      package: 'analogresearch-mcp',
      install: 'npx analogresearch-mcp',
    },
  })
}
