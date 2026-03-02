import { describe, expect, it } from 'vitest'

const API_BASE_URL = (process.env.TEST_API_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://analog-research.org').replace(/\/$/, '')

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

describe('GET /api/v1/humans (integration)', () => {
  it('returns success payload with pagination fields', async () => {
    const response = await fetch(buildUrl('/api/v1/humans?limit=5&offset=0'))
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

  it('validates min_rating query parameter', async () => {
    const response = await fetch(buildUrl('/api/v1/humans?min_rating=not-a-number'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(String(json.error)).toContain('min_rating')
  })

  it('validates search length', async () => {
    const longSearch = 'a'.repeat(201)
    const response = await fetch(buildUrl(`/api/v1/humans?search=${longSearch}`))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(String(json.error)).toContain('200')
  })

  it('supports paging semantics with offset', async () => {
    const page1Response = await fetch(buildUrl('/api/v1/humans?limit=1&offset=0'))
    const page1Json = await page1Response.json()
    const page2Response = await fetch(buildUrl('/api/v1/humans?limit=1&offset=1'))
    const page2Json = await page2Response.json()

    expect(page1Response.status).toBe(200)
    expect(page2Response.status).toBe(200)
    expect(page1Json.success).toBe(true)
    expect(page2Json.success).toBe(true)
    expect(page1Json.pagination).toEqual(expect.objectContaining({ limit: 1, offset: 0 }))
    expect(page2Json.pagination).toEqual(expect.objectContaining({ limit: 1, offset: 1 }))
    expect(Array.isArray(page1Json.data)).toBe(true)
    expect(Array.isArray(page2Json.data)).toBe(true)
    expect(page1Json.data.length).toBeLessThanOrEqual(1)
    expect(page2Json.data.length).toBeLessThanOrEqual(1)
    expect(page2Json.pagination.total).toBeGreaterThanOrEqual(page2Json.data.length)
  })

  it('returns human fields with strict name typing', async () => {
    const response = await fetch(buildUrl('/api/v1/humans?limit=1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)

    if (json.data.length > 0) {
      const human = json.data[0]
      expect(typeof human.id).toBe('string')
      expect(typeof human.name).toBe('string')
      expect(Array.isArray(human.skills) || human.skills === null).toBe(true)
    }
  })

  it('does not expose private contact_email in public list responses', async () => {
    const response = await fetch(buildUrl('/api/v1/humans?limit=20'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)

    for (const human of json.data as Array<{ social_links?: Record<string, unknown> }>) {
      expect(human.social_links?.contact_email).toBeUndefined()
    }
  })

  it('does not expose private contact_email in public detail responses', async () => {
    const listResponse = await fetch(buildUrl('/api/v1/humans?limit=1'))
    const listJson = await listResponse.json()

    expect(listResponse.status).toBe(200)
    expect(listJson.success).toBe(true)

    if (listJson.data.length === 0) {
      return
    }

    const humanId = listJson.data[0].id
    const detailResponse = await fetch(buildUrl(`/api/v1/humans/${humanId}`))
    const detailJson = await detailResponse.json()

    expect(detailResponse.status).toBe(200)
    expect(detailJson.success).toBe(true)
    expect(detailJson.data.social_links?.contact_email).toBeUndefined()
  })
})
