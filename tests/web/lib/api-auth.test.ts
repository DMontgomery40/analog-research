import { describe, expect, it } from 'vitest'

import { getKeyPrefix, hasAgentScope, hashApiKey } from '@/lib/api-auth'

describe('api-auth helpers', () => {
  it('hashApiKey produces deterministic sha256 hashes', async () => {
    const hash = await hashApiKey('analoglabor_example_key')

    expect(hash).toBe('8a0c1fad703eb697aa2dcf7f513b7d12d54dd17ddc6e43213c387754ea4a8658')
  })

  it('getKeyPrefix returns the first 16 chars', () => {
    expect(getKeyPrefix('analoglabor_abcdefghijklmnopqrstuvwxyz')).toBe('analoglabor_abcd')
  })

  it('hasAgentScope checks scope membership safely', () => {
    expect(hasAgentScope({ apiKeyId: 'key-1', agentId: 'agent-1', keyPrefix: 'prefix', scopes: ['bounties:write', 'messages:read'] }, 'messages:read')).toBe(true)
    expect(hasAgentScope({ apiKeyId: 'key-1', agentId: 'agent-1', keyPrefix: 'prefix', scopes: ['bounties:write'] }, 'messages:read')).toBe(false)
    expect(hasAgentScope(null, 'messages:read')).toBe(false)
  })
})
