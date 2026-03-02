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

describe('Moderation safety invariants (deployed)', () => {
  it('fails closed without agent auth on preflight endpoint (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/moderation/preflight'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        surface: 'message',
        content: 'hello https://example.com',
        metadata: { source: 'test' },
      }),
    })

    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(JSON.stringify(json)).toContain('Unauthorized')
  })

  it('fails closed without CRON secret on rescan worker endpoint (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/moderation/rescan?limit=1'), { method: 'POST' })

    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })
})
