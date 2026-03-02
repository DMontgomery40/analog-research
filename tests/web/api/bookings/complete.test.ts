import { describe, expect, it } from 'vitest'

const API_BASE_URL = (process.env.TEST_API_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://analog-research.org').replace(/\/$/, '')
const BOOKING_ID = '00000000-0000-0000-0000-000000000000'

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

describe('POST /api/v1/bookings/[id]/complete (integration)', () => {
  it('returns 401 for unauthenticated requests', async () => {
    const response = await fetch(buildUrl(`/api/v1/bookings/${BOOKING_ID}/complete`), {
      method: 'POST',
    })

    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns 401 even when request has a JSON body but no auth', async () => {
    const response = await fetch(buildUrl(`/api/v1/bookings/${BOOKING_ID}/complete`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ confirmation: true }),
    })

    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })
})
