import { describe, expect, it } from 'vitest'

const API_BASE_URL = (process.env.TEST_API_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://analoglabor.com').replace(/\/$/, '')

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

describe('Admin API endpoints (integration)', () => {
  const endpoints = [
    '/api/v1/admin/humans?limit=1',
    '/api/v1/admin/bounties?limit=1',
    '/api/v1/admin/bookings?limit=1',
  ]

  for (const endpoint of endpoints) {
    it(`returns 401 for unauthenticated GET ${endpoint}`, async () => {
      const response = await fetch(buildUrl(endpoint))
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json).toEqual({ success: false, error: 'Unauthorized' })
    })
  }
})
