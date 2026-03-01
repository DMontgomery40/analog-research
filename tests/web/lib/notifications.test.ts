import { describe, expect, it } from 'vitest'

import { parseMarkReadRequest, splitTypesParam } from '@/lib/notifications'

describe('notifications helpers', () => {
  it('splitTypesParam returns empty array for missing input', () => {
    expect(splitTypesParam(undefined)).toEqual([])
    expect(splitTypesParam(null)).toEqual([])
  })

  it('splitTypesParam trims and drops empty values', () => {
    expect(splitTypesParam(' new_application, ,new_message ')).toEqual(['new_application', 'new_message'])
  })

  it('parseMarkReadRequest rejects invalid JSON bodies', async () => {
    const request = new Request('https://example.com/api/v1/agent/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{not json}',
    })

    await expect(parseMarkReadRequest(request)).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Invalid JSON body',
    })
  })

  it('parseMarkReadRequest requires ids or mark_all flags', async () => {
    const request = new Request('https://example.com/api/v1/agent/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    const result = await parseMarkReadRequest(request)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toBe('Invalid request body')
    }
  })

  it('parseMarkReadRequest accepts notification_ids', async () => {
    const request = new Request('https://example.com/api/v1/agent/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        notification_ids: ['00000000-0000-0000-0000-000000000001'],
      }),
    })

    await expect(parseMarkReadRequest(request)).resolves.toEqual({
      ok: true,
      notificationIds: ['00000000-0000-0000-0000-000000000001'],
      markAll: false,
    })
  })

  it('parseMarkReadRequest accepts mark_all_read (compat) and mark_all', async () => {
    const requestCompat = new Request('https://example.com/api/v1/agent/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mark_all_read: true }),
    })

    await expect(parseMarkReadRequest(requestCompat)).resolves.toEqual({
      ok: true,
      notificationIds: undefined,
      markAll: true,
    })

    const requestNew = new Request('https://example.com/api/v1/agent/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mark_all: true }),
    })

    await expect(parseMarkReadRequest(requestNew)).resolves.toEqual({
      ok: true,
      notificationIds: undefined,
      markAll: true,
    })
  })
})
