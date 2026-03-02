import { describe, expect, it } from 'vitest'

const API_BASE_URL = (process.env.TEST_API_BASE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || 'https://analog-research.org').replace(/\/$/, '')

const HUMAN_ID = '00000000-0000-0000-0000-000000000000'

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function expectNetlifyRuntime(response: Response) {
  expect(response.headers.get('x-nf-request-id')).toBeTruthy()
}

describe('PATCH /api/v1/humans/[id] (integration invariant)', () => {
  it('fails closed without a session (Netlify runtime)', async () => {
    const response = await fetch(buildUrl(`/api/v1/humans/${HUMAN_ID}`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        location: 'Denver, CO',
        timezone: 'America/Denver',
      }),
    })

    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(JSON.stringify(json)).toContain('Unauthorized')
  })
})

