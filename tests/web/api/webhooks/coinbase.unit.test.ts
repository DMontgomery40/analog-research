import { describe, expect, it } from 'vitest'

const API_BASE_URL = (process.env.TEST_API_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://analoglabor.com').replace(/\/$/, '')

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

describe('POST /api/v1/webhooks/coinbase (integration)', () => {
  it('returns 400 when required Coinbase headers are missing', async () => {
    const response = await fetch(buildUrl('/api/v1/webhooks/coinbase'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{}',
    })

    if (response.status === 503) {
      await expect(response.json()).resolves.toEqual({ error: 'Missing webhook secret configuration' })
      return
    }

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Missing required Coinbase headers' })
  })

  it('returns 400 when signature is invalid', async () => {
    const response = await fetch(buildUrl('/api/v1/webhooks/coinbase'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hook0-id': 'evt_test_invalid',
        'x-hook0-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-hook0-signature': 'v1=deadbeef',
      },
      body: '{}',
    })

    if (response.status === 503) {
      await expect(response.json()).resolves.toEqual({ error: 'Missing webhook secret configuration' })
      return
    }

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid signature' })
  })

  it('returns 400 when signature format is invalid', async () => {
    const response = await fetch(buildUrl('/api/v1/webhooks/coinbase'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hook0-id': 'evt_test_invalid_format',
        'x-hook0-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-hook0-signature': 'bad',
      },
      body: '{}',
    })

    if (response.status === 503) {
      await expect(response.json()).resolves.toEqual({ error: 'Missing webhook secret configuration' })
      return
    }

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid signature' })
  })
})
