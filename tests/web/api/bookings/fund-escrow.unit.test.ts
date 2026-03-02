import { describe, expect, it } from 'vitest'

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true'
const integrationDescribe = RUN_INTEGRATION_TESTS ? describe : describe.skip

const API_BASE_URL = (process.env.TEST_API_BASE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || 'https://analog-research.org').replace(/\/$/, '')

const BOOKING_ID = '00000000-0000-0000-0000-000000000000'

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function expectNetlifyRuntime(response: Response) {
  expect(response.headers.get('x-nf-request-id')).toBeTruthy()
}

integrationDescribe('POST /api/v1/bookings/[id]/fund-escrow (integration invariant)', () => {
  it('returns 401 for unauthenticated stripe funding attempts (Netlify runtime)', async () => {
    const response = await fetch(buildUrl(`/api/v1/bookings/${BOOKING_ID}/fund-escrow`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ payment_method: 'stripe' }),
    })

    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns 401 for unauthenticated crypto funding attempts (Netlify runtime)', async () => {
    const response = await fetch(buildUrl(`/api/v1/bookings/${BOOKING_ID}/fund-escrow`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ payment_method: 'crypto' }),
    })

    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('still returns 401 when request looks like MCP traffic but no auth is provided', async () => {
    const response = await fetch(buildUrl(`/api/v1/bookings/${BOOKING_ID}/fund-escrow`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-analogresearch-source': 'mcp',
      },
      body: JSON.stringify({ payment_method: 'stripe' }),
    })

    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })
})
