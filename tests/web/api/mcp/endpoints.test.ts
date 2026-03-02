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

function assertOauthChallengeIfPresent(response: Response) {
  const challenge = response.headers.get('WWW-Authenticate')
  if (!challenge) return

  expect(challenge.startsWith('Bearer ')).toBe(true)
  expect(challenge).toContain('resource_metadata="')
  expect(challenge).toContain('.well-known/oauth-protected-resource')
  expect(challenge).toContain('scope="')
}

describe('MCP /api/v1/mcp endpoint (deployed invariants)', () => {
  it('rejects unauthenticated requests (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/mcp'), {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    expectNetlifyRuntime(response)
    assertOauthChallengeIfPresent(response)

    const json = await response.json()
    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('rejects invalid bearer tokens (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/mcp'), {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        authorization: 'Bearer not_a_real_oauth_token',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    })

    expectNetlifyRuntime(response)
    assertOauthChallengeIfPresent(response)

    const json = await response.json()
    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('rejects unauthenticated DELETE requests (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/mcp'), { method: 'DELETE' })

    expectNetlifyRuntime(response)
    assertOauthChallengeIfPresent(response)

    const json = await response.json()
    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })
})
