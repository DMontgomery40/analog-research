import { describe, expect, it } from 'vitest'

const API_BASE_URL = (process.env.TEST_API_BASE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || 'https://analoglabor.com').replace(/\/$/, '')

const BOOKING_ID = '00000000-0000-0000-0000-000000000000'
const PROOF_ID = '00000000-0000-0000-0000-000000000000'

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function expectNetlifyRuntime(response: Response) {
  expect(response.headers.get('x-nf-request-id')).toBeTruthy()
}

describe('PATCH /api/v1/bookings/[id]/proof/[proofId] (integration invariant)', () => {
  it('fails closed without auth (Netlify runtime)', async () => {
    const response = await fetch(buildUrl(`/api/v1/bookings/${BOOKING_ID}/proof/${PROOF_ID}`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: false, feedback: 'Please revise.' }),
    })

    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(JSON.stringify(json)).toContain('Unauthorized')
  })

  it('still returns 401 when request looks like MCP traffic but no auth is provided', async () => {
    const response = await fetch(buildUrl(`/api/v1/bookings/${BOOKING_ID}/proof/${PROOF_ID}`), {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-analoglabor-source': 'mcp',
      },
      body: JSON.stringify({ approved: false, feedback: 'Please revise.' }),
    })

    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(JSON.stringify(json)).toContain('Unauthorized')
  })
})
