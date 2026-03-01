import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateAgent, hasAgentScope } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'

export const runtime = 'nodejs'

const MAX_IDS = 50
const uuidSchema = z.string().uuid()

type ParseListResult =
  | { ok: true; value: string[] }
  | { ok: false; error: string }

interface SnapshotRow {
  entity_id: string
  score_value: number | string | null
  confidence: number | string | null
  version: string | null
  sample_size: number | string | null
  metadata: Record<string, unknown> | null
  computed_at: string | null
}

interface LegitimacyCounters {
  sample_size: number
  applications_total: number
  bookings_total: number
  disputes_open: number
}

function parseIdList(raw: string | null, label: string): ParseListResult {
  if (!raw) {
    return { ok: true, value: [] }
  }

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (values.length > MAX_IDS) {
    return { ok: false, error: `${label} must contain at most ${MAX_IDS} ids` }
  }

  const invalid = values.filter((value) => !uuidSchema.safeParse(value).success)
  if (invalid.length > 0) {
    return { ok: false, error: `${label} must be a comma-separated list of UUIDs` }
  }

  return { ok: true, value: values }
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeCounters(snapshot: SnapshotRow | null, type: 'human' | 'bounty'): LegitimacyCounters | null {
  if (!snapshot) return null

  const metadata = snapshot.metadata ?? {}
  const metadataRecord = typeof metadata === 'object' && metadata !== null ? metadata as Record<string, unknown> : {}
  const applicationsTotalRaw = type === 'bounty'
    ? metadataRecord.apps_total ?? metadataRecord.applications_total
    : metadataRecord.applications_total ?? metadataRecord.apps_total

  return {
    sample_size: toNumber(snapshot.sample_size) ?? 0,
    applications_total: toNumber(applicationsTotalRaw as number | string | null | undefined) ?? 0,
    bookings_total: toNumber(metadataRecord.bookings_total as number | string | null | undefined) ?? 0,
    disputes_open: toNumber(metadataRecord.disputes_open as number | string | null | undefined) ?? 0,
  }
}

async function fetchLatestSnapshots(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  entityType: 'human' | 'bounty',
  scoreType: 'human_legitimacy' | 'bounty_legitimacy',
  entityIds: string[]
): Promise<Map<string, SnapshotRow>> {
  if (entityIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('quality_score_snapshots')
    .select('entity_id, score_value, confidence, version, sample_size, metadata, computed_at')
    .eq('entity_type', entityType)
    .eq('score_type', scoreType)
    .in('entity_id', entityIds)
    .order('computed_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  const latestById = new Map<string, SnapshotRow>()
  for (const row of (data || []) as SnapshotRow[]) {
    if (!latestById.has(row.entity_id)) {
      latestById.set(row.entity_id, row)
    }
  }

  return latestById
}

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request)
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasAgentScope(agent, 'read') && !hasAgentScope(agent, 'write')) {
    return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
  }

  const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
  if (rateLimitResponse) return rateLimitResponse

  const searchParams = request.nextUrl.searchParams
  const humanIdsResult = parseIdList(searchParams.get('human_ids'), 'human_ids')
  if (!humanIdsResult.ok) {
    return NextResponse.json({ success: false, error: humanIdsResult.error }, { status: 400 })
  }

  const bountyIdsResult = parseIdList(searchParams.get('bounty_ids'), 'bounty_ids')
  if (!bountyIdsResult.ok) {
    return NextResponse.json({ success: false, error: bountyIdsResult.error }, { status: 400 })
  }

  const humanIds = humanIdsResult.value
  const bountyIds = bountyIdsResult.value

  if (humanIds.length === 0 && bountyIds.length === 0) {
    return NextResponse.json(
      { success: false, error: 'At least one of human_ids or bounty_ids is required' },
      { status: 400 }
    )
  }

  const supabase = await createServiceClient()

  const [humanRowsResult, bountyRowsResult, humanSnapshots, bountySnapshots] = await Promise.all([
    humanIds.length > 0
      ? supabase
        .from('humans')
        .select('id, human_legitimacy_score, human_legitimacy_confidence, human_legitimacy_version')
        .in('id', humanIds)
      : Promise.resolve({ data: [], error: null }),
    bountyIds.length > 0
      ? supabase
        .from('bounties')
        .select('id, bounty_legitimacy_score, bounty_legitimacy_confidence, bounty_legitimacy_version')
        .in('id', bountyIds)
      : Promise.resolve({ data: [], error: null }),
    fetchLatestSnapshots(supabase, 'human', 'human_legitimacy', humanIds),
    fetchLatestSnapshots(supabase, 'bounty', 'bounty_legitimacy', bountyIds),
  ])

  if (humanRowsResult.error) {
    return NextResponse.json({ success: false, error: humanRowsResult.error.message }, { status: 500 })
  }

  if (bountyRowsResult.error) {
    return NextResponse.json({ success: false, error: bountyRowsResult.error.message }, { status: 500 })
  }

  const humans = ((humanRowsResult.data || []) as Array<{
    id: string
    human_legitimacy_score: number | string | null
    human_legitimacy_confidence: number | string | null
    human_legitimacy_version: string | null
  }>).map((row) => {
    const snapshot = humanSnapshots.get(row.id) ?? null
    return {
      id: row.id,
      score: toNumber(row.human_legitimacy_score) ?? toNumber(snapshot?.score_value),
      confidence: toNumber(row.human_legitimacy_confidence) ?? toNumber(snapshot?.confidence),
      version: row.human_legitimacy_version ?? snapshot?.version ?? null,
      counters: normalizeCounters(snapshot, 'human'),
      computed_at: snapshot?.computed_at ?? null,
    }
  })

  const bounties = ((bountyRowsResult.data || []) as Array<{
    id: string
    bounty_legitimacy_score: number | string | null
    bounty_legitimacy_confidence: number | string | null
    bounty_legitimacy_version: string | null
  }>).map((row) => {
    const snapshot = bountySnapshots.get(row.id) ?? null
    return {
      id: row.id,
      score: toNumber(row.bounty_legitimacy_score) ?? toNumber(snapshot?.score_value),
      confidence: toNumber(row.bounty_legitimacy_confidence) ?? toNumber(snapshot?.confidence),
      version: row.bounty_legitimacy_version ?? snapshot?.version ?? null,
      counters: normalizeCounters(snapshot, 'bounty'),
      computed_at: snapshot?.computed_at ?? null,
    }
  })

  return NextResponse.json({
    success: true,
    data: {
      humans,
      bounties,
    },
  })
}
