import { describe, expect, it } from 'vitest'

const API_BASE_URL = (process.env.TEST_API_BASE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || 'https://analoglabor.com').replace(/\/$/, '')

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function expectNetlifyRuntime(response: Response) {
  expect(response.headers.get('x-nf-request-id')).toBeTruthy()
}

describe('POST /api/v1/webhooks/stripe (integration invariant)', () => {
  it('returns 400 when signature header is missing (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/webhooks/stripe'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{}',
    })

    expectNetlifyRuntime(response)
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

    expectNetlifyRuntime(response)
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

    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'Invalid signature' })
  })
})

