import { describe, expect, it } from 'vitest'

const API_BASE_URL = (process.env.TEST_API_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://analoglabor.com').replace(/\/$/, '')

const CONVERSATION_ID = '00000000-0000-0000-0000-000000000000'

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

describe('POST /api/v1/conversations/[id]/messages (integration)', () => {
  it('returns 401 for unauthenticated requests', async () => {
    const response = await fetch(buildUrl(`/api/v1/conversations/${CONVERSATION_ID}/messages`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ content: 'hello from test' }),
    })

    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, error: 'Unauthorized' })
  })
})

