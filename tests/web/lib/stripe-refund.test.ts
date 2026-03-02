import { describe, expect, it } from 'vitest'

const API_BASE_URL = (
  process.env.TEST_API_BASE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || 'https://analog-research.org'
).replace(/\/$/, '')

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function expectNetlifyRuntime(response: Response) {
  expect(response.headers.get('x-nf-request-id')).toBeTruthy()
}

describe('Stripe refund escrow (deployed invariants)', () => {
  it('does not allow unauthenticated auto-complete runs that could trigger compensating refunds (Netlify runtime)', async () => {
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
})
