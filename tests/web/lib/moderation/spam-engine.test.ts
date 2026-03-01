import { describe, expect, it } from 'vitest'

import { assessSpam, buildHash } from '@/lib/moderation/spam-engine'

type DuplicateRow = { actor_id: string }
type EventRow = { id: string }

interface Scenario {
  duplicates: DuplicateRow[]
  recentEvents: EventRow[]
}

interface WriteRecord {
  table: string
  operation: 'insert' | 'upsert'
  payload: Record<string, unknown>
}

class FakeSupabase {
  readonly writes: WriteRecord[] = []

  constructor(private readonly scenario: Scenario) {}

  from(table: string) {
    return new FakeQuery(table, this.scenario, this.writes)
  }
}

class FakeQuery {
  private readonly filters = new Map<string, unknown>()

  constructor(
    private readonly table: string,
    private readonly scenario: Scenario,
    private readonly writes: WriteRecord[],
  ) {}

  select(_columns: string) {
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value)
    return this
  }

  async gte(column: string, value: string): Promise<{ data: unknown[] }> {
    this.filters.set(column, value)

    if (this.table === 'spam_fingerprints') {
      return { data: this.scenario.duplicates }
    }

    if (this.table === 'moderation_events') {
      return { data: this.scenario.recentEvents }
    }

    return { data: [] }
  }

  async insert(payload: Record<string, unknown>): Promise<{ data: null }> {
    this.writes.push({ table: this.table, operation: 'insert', payload })
    return { data: null }
  }

  async upsert(payload: Record<string, unknown>): Promise<{ data: null }> {
    this.writes.push({ table: this.table, operation: 'upsert', payload })
    return { data: null }
  }
}

describe('spam-engine', () => {
  it('buildHash returns a stable sha256 hash', () => {
    expect(buildHash('same input')).toBe('c2f991739d5824b4e1d8bafaffb735b9e4061f801d82c4aaf57aea02495f750c')
  })

  it('blocks high-risk campaigns with high velocity and link farming signals', async () => {
    const supabase = new FakeSupabase({
      duplicates: [
        { actor_id: 'agent-a' },
        { actor_id: 'agent-a' },
        { actor_id: 'agent-b' },
        { actor_id: 'agent-b' },
        { actor_id: 'agent-c' },
        { actor_id: 'agent-c' },
        { actor_id: 'agent-a' },
        { actor_id: 'agent-b' },
        { actor_id: 'agent-c' },
      ],
      recentEvents: Array.from({ length: 30 }, (_, idx) => ({ id: `event-${idx}` })),
    })

    const result = await assessSpam({
      supabase,
      surface: 'bounty',
      actorType: 'agent',
      actorId: 'agent-a',
      normalizedContent: 'a'.repeat(150),
      urls: [
        'https://alpha.example/path',
        'https://beta.example/path',
        'https://gamma.example/path',
      ],
      contentHash: buildHash('campaign-content'),
    })

    expect(result.action).toBe('block')
    expect(result.score).toBe(1)
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'DUPLICATE_CAMPAIGN',
      'HIGH_VELOCITY_POSTING',
      'LOW_ENTROPY_TEMPLATE_SPAM',
      'LINK_FARM_PATTERN',
    ]))
    expect(supabase.writes.map((row) => `${row.table}:${row.operation}`)).toEqual([
      'spam_fingerprints:insert',
      'spam_clusters:upsert',
    ])
  })

  it('suppresses repeated duplicate campaigns before full block thresholds', async () => {
    const supabase = new FakeSupabase({
      duplicates: [
        { actor_id: 'agent-a' },
        { actor_id: 'agent-a' },
        { actor_id: 'agent-b' },
        { actor_id: 'agent-b' },
      ],
      recentEvents: Array.from({ length: 4 }, (_, idx) => ({ id: `event-${idx}` })),
    })

    const result = await assessSpam({
      supabase,
      surface: 'message',
      actorType: 'agent',
      actorId: 'agent-a',
      normalizedContent: 'Need 3 humans to review onboarding copy in Spanish.',
      urls: ['https://docs.example/review'],
      contentHash: buildHash('duplicate-campaign-content'),
    })

    expect(result.action).toBe('suppress')
    expect(result.reasonCodes).toContain('DUPLICATE_CAMPAIGN')
    expect(supabase.writes.map((row) => `${row.table}:${row.operation}`)).toEqual([
      'spam_fingerprints:insert',
      'spam_clusters:upsert',
    ])
  })

  it('applies cooldown for high actor velocity without duplicate campaign threshold', async () => {
    const supabase = new FakeSupabase({
      duplicates: [{ actor_id: 'agent-a' }],
      recentEvents: Array.from({ length: 13 }, (_, idx) => ({ id: `event-${idx}` })),
    })

    const result = await assessSpam({
      supabase,
      surface: 'conversation_initial',
      actorType: 'agent',
      actorId: 'agent-a',
      normalizedContent: 'Need someone near Austin to do a product pickup and photo verification.',
      urls: ['https://analoglabor.com/task-details'],
      contentHash: buildHash('high-velocity'),
    })

    expect(result.action).toBe('cooldown')
    expect(result.reasonCodes).toContain('HIGH_VELOCITY_POSTING')
    expect(supabase.writes.map((row) => `${row.table}:${row.operation}`)).toEqual([
      'spam_fingerprints:insert',
    ])
  })
})
