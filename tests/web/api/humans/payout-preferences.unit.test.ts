import { describe, expect, it } from 'vitest'

const API_BASE_URL = (process.env.TEST_API_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://analoglabor.com').replace(/\/$/, '')

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

describe('GET/PATCH /api/v1/humans/me/payout-preferences (integration)', () => {
  it('GET returns 401 for unauthenticated users', async () => {
    const response = await fetch(buildUrl('/api/v1/humans/me/payout-preferences'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('PATCH returns 401 for unauthenticated users', async () => {
    const response = await fetch(buildUrl('/api/v1/humans/me/payout-preferences'), {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ paypal_waitlist: true }),
    })
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })
})

