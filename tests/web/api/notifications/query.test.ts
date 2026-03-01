import { describe, expect, it } from 'vitest'

import {
  safeParseAgentNotificationsQuery,
  safeParseHumanNotificationsQuery,
  DEFAULT_NOTIFICATIONS_LIMIT,
} from '@/lib/notifications-query'

describe('notifications query parsing', () => {
  it('applies defaults when human query params are missing', () => {
    const result = safeParseHumanNotificationsQuery(new URLSearchParams())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        unread_only: false,
        limit: DEFAULT_NOTIFICATIONS_LIMIT,
        offset: 0,
      })
    }
  })

  it('applies defaults when agent query params are missing', () => {
    const result = safeParseAgentNotificationsQuery(new URLSearchParams())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        unread_only: true,
        limit: DEFAULT_NOTIFICATIONS_LIMIT,
        offset: 0,
        types: undefined,
      })
    }
  })

  it('parses unread_only=false correctly (no string-to-true coercion)', () => {
    const result = safeParseHumanNotificationsQuery(new URLSearchParams({ unread_only: 'false' }))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.unread_only).toBe(false)
    }
  })

  it('rejects invalid limit values', () => {
    const result = safeParseHumanNotificationsQuery(new URLSearchParams({ limit: '0' }))
    expect(result.success).toBe(false)
  })
})

