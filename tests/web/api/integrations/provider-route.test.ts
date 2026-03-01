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

describe('PUT /api/v1/integrations/[provider] (integration invariant)', () => {
  it('fails closed without auth (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/integrations/proxypics'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        env: 'live',
        api_key: 'pk_live_example',
      }),
    })

    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(JSON.stringify(json)).toContain('Unauthorized')
  })
})

