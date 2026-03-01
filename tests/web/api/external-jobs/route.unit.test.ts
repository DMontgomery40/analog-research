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

describe('/api/v1/external-jobs (integration invariants)', () => {
  it('GET fails closed without auth (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/external-jobs?kind=field_check&limit=1'))
    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(JSON.stringify(json)).toContain('Unauthorized')
  })

  it('POST fails closed without auth (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/external-jobs'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'field_check',
        instructions: 'Document front elevation',
        address: '100 Main St, Austin, TX',
      }),
    })
    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(JSON.stringify(json)).toContain('Unauthorized')
  })
})

