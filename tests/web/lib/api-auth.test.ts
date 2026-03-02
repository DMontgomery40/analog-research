import { describe, expect, it } from 'vitest'

import { getKeyPrefix, hasAgentScope, hashApiKey } from '@/lib/api-auth'

describe('api-auth helpers', () => {
  it('hashApiKey produces deterministic sha256 hashes', async () => {
    const hash = await hashApiKey('ar_live_example_key')

    expect(hash).toBe('677be7193daef62ef9ae6768b228b562f7721ca739042211712fb3246e17b61a')
  })

  it('getKeyPrefix returns the first 16 chars', () => {
    expect(getKeyPrefix('ar_live_abcdefghijklmnopqrstuvwxyz')).toBe('ar_live_abcdefgh')
  })

  it('hasAgentScope checks scope membership safely', () => {
    expect(hasAgentScope({ apiKeyId: 'key-1', agentId: 'agent-1', keyPrefix: 'prefix', scopes: ['bounties:write', 'messages:read'] }, 'messages:read')).toBe(true)
    expect(hasAgentScope({ apiKeyId: 'key-1', agentId: 'agent-1', keyPrefix: 'prefix', scopes: ['bounties:write'] }, 'messages:read')).toBe(false)
    expect(hasAgentScope(null, 'messages:read')).toBe(false)
  })
})
