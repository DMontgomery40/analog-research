import { describe, expect, it } from 'vitest'

const API_BASE_URL = (process.env.TEST_API_BASE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || 'https://analog-research.org').replace(/\/$/, '')

const ACTION_ID = '00000000-0000-0000-0000-000000000000'

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function expectNetlifyRuntime(response: Response) {
  expect(response.headers.get('x-nf-request-id')).toBeTruthy()
}

describe('/api/v1/autopilot/actions (integration invariants)', () => {
  it('GET fails closed without a session (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/autopilot/actions?limit=5'))
    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('POST rollback fails closed without a session (Netlify runtime)', async () => {
    const response = await fetch(buildUrl(`/api/v1/autopilot/actions/${ACTION_ID}/rollback`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rollback_type: 'cancel_planned_action' }),
    })
    expectNetlifyRuntime(response)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })
})

