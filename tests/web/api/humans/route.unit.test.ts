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

describe('GET/POST /api/v1/humans (integration invariant)', () => {
  it('GET returns success payload with pagination fields (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/humans?limit=5&offset=0'))
    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.pagination).toEqual(expect.objectContaining({
      limit: 5,
      offset: 0,
    }))
    expect(typeof json.pagination.total).toBe('number')
  })

  it('GET validates min_rating query parameter', async () => {
    const response = await fetch(buildUrl('/api/v1/humans?min_rating=not-a-number'))
    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(String(json.error)).toContain('min_rating')
  })

  it('GET validates search length', async () => {
    const longSearch = 'a'.repeat(201)
    const response = await fetch(buildUrl(`/api/v1/humans?search=${longSearch}`))
    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(String(json.error)).toContain('200')
  })

  it('GET supports paging semantics with offset', async () => {
    const page1Response = await fetch(buildUrl('/api/v1/humans?limit=1&offset=0'))
    expectNetlifyRuntime(page1Response)
    const page1Json = await page1Response.json()

    const page2Response = await fetch(buildUrl('/api/v1/humans?limit=1&offset=1'))
    expectNetlifyRuntime(page2Response)
    const page2Json = await page2Response.json()

    expect(page1Response.status).toBe(200)
    expect(page2Response.status).toBe(200)
    expect(page1Json.success).toBe(true)
    expect(page2Json.success).toBe(true)
    expect(page1Json.pagination).toEqual(expect.objectContaining({ limit: 1, offset: 0 }))
    expect(page2Json.pagination).toEqual(expect.objectContaining({ limit: 1, offset: 1 }))
    expect(Array.isArray(page1Json.data)).toBe(true)
    expect(Array.isArray(page2Json.data)).toBe(true)
  })

  it('GET does not expose private contact_email in list responses', async () => {
    const response = await fetch(buildUrl('/api/v1/humans?limit=20'))
    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)

    for (const human of json.data as Array<{ social_links?: Record<string, unknown> }>) {
      expect(human.social_links?.contact_email).toBeUndefined()
    }
  })

  it('POST fails closed without auth (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/humans'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Human',
        bio: 'test',
      }),
    })
    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })
})

