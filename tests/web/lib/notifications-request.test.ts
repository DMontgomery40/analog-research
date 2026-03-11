import { describe, expect, it } from 'vitest'

import { parseMarkReadRequest } from '@/lib/notifications'

describe('notifications request parsing', () => {
  it('returns an operator hint for invalid JSON bodies', async () => {
    const request = new Request('https://analog-research.org/api/v1/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{bad json',
    })

    await expect(parseMarkReadRequest(request)).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Invalid JSON body',
      operatorHint: 'check notifications payload',
    })
  })

  it('returns an operator hint for schema validation failures', async () => {
    const request = new Request('https://analog-research.org/api/v1/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notification_ids: [] }),
    })

    const result = await parseMarkReadRequest(request)

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.status).toBe(400)
    expect(result.error).toBe('Invalid request body')
    expect(result.operatorHint).toBe('check notifications payload')
  })
})
