import { describe, expect, it } from 'vitest'

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true'
const integrationDescribe = RUN_INTEGRATION_TESTS ? describe : describe.skip

const API_BASE_URL = (
  process.env.TEST_API_BASE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || 'https://analog-research.org'
).replace(/\/$/, '')

const BOOKING_ID = '00000000-0000-0000-0000-000000000000'

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function expectNetlifyRuntime(response: Response) {
  expect(response.headers.get('x-nf-request-id')).toBeTruthy()
}

integrationDescribe('Stripe escrow release + transfer (deployed invariants)', () => {
  it('protects auto-complete endpoint that can trigger capture/transfer (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/bookings/auto-complete'), {
      method: 'POST',
      headers: { accept: 'application/json' },
    })

    expectNetlifyRuntime(response)
    const json = await response.json()

    if (response.status === 401) {
      expect(json).toEqual({ success: false, error: 'Unauthorized' })
      return
    }

    // Some deployed environments may not configure CRON_SECRET; fail closed.
    expect(response.status).toBe(503)
    expect(json.success).toBe(false)
    expect(String(json.error || '')).toContain('CRON_SECRET')
  })

  it('protects booking completion endpoint that can capture escrow (Netlify runtime)', async () => {
    const response = await fetch(buildUrl(`/api/v1/bookings/${BOOKING_ID}/complete`), {
      method: 'POST',
      headers: { accept: 'application/json' },
    })

    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })
})
