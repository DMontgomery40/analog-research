import { describe, expect, it } from 'vitest'

const API_BASE_URL = (process.env.TEST_API_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://analoglabor.com').replace(/\/$/, '')

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

describe('POST /api/v1/webhooks/stripe (integration)', () => {
  it('returns 400 when signature header is missing', async () => {
    const response = await fetch(buildUrl('/api/v1/webhooks/stripe'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{}',
    })

    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'Missing signature' })
  })

  it('returns 400 when signature is malformed', async () => {
    const response = await fetch(buildUrl('/api/v1/webhooks/stripe'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'bad',
      },
      body: '{}',
    })

    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'Invalid signature' })
  })

  it('returns 400 when signature is invalid', async () => {
    const response = await fetch(buildUrl('/api/v1/webhooks/stripe'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'v1=deadbeef',
      },
      body: '{}',
    })

    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'Invalid signature' })
  })
})
