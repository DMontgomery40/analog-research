import { beforeEach, describe, expect, it } from 'vitest'

import { buildRateLimitKey, enforceRateLimit, resetRateLimitStore } from '@/lib/rate-limit'

describe('rate-limit utility', () => {
  beforeEach(() => {
    resetRateLimitStore()
  })

  it('blocks after the limit and resets on a new window', () => {
    const key = buildRateLimitKey({ agentId: 'agent-1', route: 'mcp' })

    const first = enforceRateLimit({ key, limit: 2, windowMs: 1000, nowMs: 0 })
    const second = enforceRateLimit({ key, limit: 2, windowMs: 1000, nowMs: 200 })
    const blocked = enforceRateLimit({ key, limit: 2, windowMs: 1000, nowMs: 400 })
    const reset = enforceRateLimit({ key, limit: 2, windowMs: 1000, nowMs: 1200 })

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(blocked.allowed).toBe(false)
    expect(reset.allowed).toBe(true)
  })

  it('resets after manual store clear', () => {
    const key = buildRateLimitKey({ agentId: 'agent-2', route: 'moderation-preflight' })

    const first = enforceRateLimit({ key, limit: 1, windowMs: 1000, nowMs: 0 })
    const blocked = enforceRateLimit({ key, limit: 1, windowMs: 1000, nowMs: 100 })

    resetRateLimitStore()

    const reset = enforceRateLimit({ key, limit: 1, windowMs: 1000, nowMs: 200 })

    expect(first.allowed).toBe(true)
    expect(blocked.allowed).toBe(false)
    expect(reset.allowed).toBe(true)
  })
})
