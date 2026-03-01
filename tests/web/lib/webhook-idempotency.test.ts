import { describe, expect, it } from 'vitest'

const API_BASE_URL = (
  process.env.TEST_API_BASE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || 'https://analoglabor.com'
).replace(/\/$/, '')

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function expectNetlifyRuntime(response: Response) {
  expect(response.headers.get('x-nf-request-id')).toBeTruthy()
}

describe('Webhook idempotency (deployed invariants)', () => {
  it('fails closed deterministically for missing Stripe signature (Netlify runtime)', async () => {
    const requestInit = {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: '{}',
    } as const

    const first = await fetch(buildUrl('/api/v1/webhooks/stripe'), requestInit)
    const second = await fetch(buildUrl('/api/v1/webhooks/stripe'), requestInit)

    expectNetlifyRuntime(first)
    expectNetlifyRuntime(second)

    expect(first.status).toBe(400)
    expect(second.status).toBe(400)

    await expect(first.json()).resolves.toEqual({ error: 'Missing signature' })
    await expect(second.json()).resolves.toEqual({ error: 'Missing signature' })
  })

  it('fails closed deterministically for missing Coinbase headers (Netlify runtime)', async () => {
    const requestInit = {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: '{}',
    } as const

    const first = await fetch(buildUrl('/api/v1/webhooks/coinbase'), requestInit)
    const second = await fetch(buildUrl('/api/v1/webhooks/coinbase'), requestInit)

    expectNetlifyRuntime(first)
    expectNetlifyRuntime(second)

    expect(first.status).toBe(second.status)

    if (first.status === 503) {
      await expect(first.json()).resolves.toEqual({ error: 'Missing webhook secret configuration' })
      await expect(second.json()).resolves.toEqual({ error: 'Missing webhook secret configuration' })
      return
    }

    expect(first.status).toBe(400)
    await expect(first.json()).resolves.toEqual({ error: 'Missing required Coinbase headers' })
    await expect(second.json()).resolves.toEqual({ error: 'Missing required Coinbase headers' })
  })
})
