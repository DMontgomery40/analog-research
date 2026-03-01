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

describe('POST /api/v1/autopilot/tick (integration invariant)', () => {
  it('rejects requests without cron auth (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/autopilot/tick'), {
      method: 'POST',
    })

    expectNetlifyRuntime(response)
    const json = await response.json()

    // Deployed envs should generally have CRON_SECRET configured; if not, fail closed with 503.
    expect([401, 503]).toContain(response.status)
    if (response.status === 401) {
      expect(json).toEqual({ success: false, error: 'Unauthorized' })
      return
    }
    expect(json).toEqual({ success: false, error: 'CRON_SECRET is not configured' })
  })
})
