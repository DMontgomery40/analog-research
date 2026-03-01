import { describe, expect, it } from 'vitest'

import { resolveSessionOwnerAgent } from '@/lib/session-owner-agent'

type StubResponse = {
  data: any
  error: { message: string } | null
}

function createSupabaseStub(maybeSingleResponses: StubResponse[]) {
  let maybeSingleIndex = 0
  const updates: Array<Record<string, unknown>> = []

  const selectChain = {
    eq() {
      return selectChain
    },
    order() {
      return selectChain
    },
    limit() {
      return selectChain
    },
    maybeSingle: async () => {
      const response = maybeSingleResponses[maybeSingleIndex]
      maybeSingleIndex += 1
      return response || { data: null, error: null }
    },
  }

  const updateChain = {
    eq() {
      return updateChain
    },
    is: async () => ({ data: null, error: null }),
  }

  const supabase = {
    from() {
      return {
        select() {
          return selectChain
        },
        update(value: Record<string, unknown>) {
          updates.push(value)
          return updateChain
        },
      }
    },
  }

  return {
    supabase,
    updates,
  }
}

describe('resolveSessionOwnerAgent', () => {
  it('returns owner-agent context when owner_human_id mapping exists', async () => {
    const { supabase, updates } = createSupabaseStub([
      { data: { id: 'human_1' }, error: null },
      { data: { id: 'agent_fk_1' }, error: null },
    ])

    const result = await resolveSessionOwnerAgent(supabase as any, 'user_1')

    expect(result).toEqual({
      userId: 'user_1',
      humanId: 'human_1',
      agentId: 'agent_fk_1',
    })
    expect(updates).toEqual([])
  })

  it('falls back to legacy human_<id> lookup and backfills owner_human_id', async () => {
    const { supabase, updates } = createSupabaseStub([
      { data: { id: 'human_1' }, error: null },
      { data: null, error: null },
      { data: { id: 'agent_legacy_1' }, error: null },
    ])

    const result = await resolveSessionOwnerAgent(supabase as any, 'user_1')

    expect(result).toEqual({
      userId: 'user_1',
      humanId: 'human_1',
      agentId: 'agent_legacy_1',
    })
    expect(updates).toContainEqual({ owner_human_id: 'human_1' })
  })

  it('returns null when no human profile exists for the session user', async () => {
    const { supabase } = createSupabaseStub([
      { data: null, error: null },
    ])

    const result = await resolveSessionOwnerAgent(supabase as any, 'user_1')

    expect(result).toBeNull()
  })

  it('returns null when no owner agent exists in FK or legacy lookup', async () => {
    const { supabase } = createSupabaseStub([
      { data: { id: 'human_1' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    const result = await resolveSessionOwnerAgent(supabase as any, 'user_1')

    expect(result).toBeNull()
  })
})
