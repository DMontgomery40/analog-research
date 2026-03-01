import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { parsePaginationParams } from '@/lib/request-params'
import { createFieldCheckExternalJob } from '@/lib/external-jobs/service'
import { EXTERNAL_PROVIDERS, normalizeExternalJobStatus } from '@/lib/external-jobs/types'
import { ensureExternalIntegrationsSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'
import {
  evaluateExternalJobsPolicy,
  loadAgentToolPolicy,
  resolveToolPolicySourceFromHeaders,
  writeAgentToolAuditLogBestEffort,
} from '@/lib/tool-policy'

export const runtime = 'nodejs'

const createSchema = z.object({
  kind: z.literal('field_check'),
  title: z.string().max(200).optional(),
  instructions: z.string().min(1).max(5000),
  address: z.string().min(1).max(500),
  provider: z.enum(EXTERNAL_PROVIDERS).optional(),
  provider_env: z.enum(['live', 'sandbox']).optional(),
  expires_at: z.string().datetime().nullable().optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  public_only: z.boolean().optional(),
  auto_approve: z.boolean().optional(),
  template_token: z.string().nullable().optional(),
  tasks: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
  })).nullable().optional(),
  price_boost_cents: z.number().int().min(0).nullable().optional(),
  unlimited_tasks: z.boolean().nullable().optional(),
  unlimited_tasks_descriptions: z.string().nullable().optional(),
  bounty_id: z.string().uuid().nullable().optional(),
  booking_id: z.string().uuid().nullable().optional(),
  application_id: z.string().uuid().nullable().optional(),
  conversation_id: z.string().uuid().nullable().optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireOwnerAgentAccess(request, 'read', { createIfMissing: true })
  if (!auth.ok) return auth.response
  const { actingAgentId: agentId, serviceClient: supabase } = auth.context

  const schema = await ensureExternalIntegrationsSchema({ supabase })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
  }

  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  const statusRaw = url.searchParams.get('status')
  const provider = url.searchParams.get('provider')
  const providerEnv = url.searchParams.get('provider_env')
  const bountyId = url.searchParams.get('bounty_id')
  const bookingId = url.searchParams.get('booking_id')
  const applicationId = url.searchParams.get('application_id')
  const conversationId = url.searchParams.get('conversation_id')

  const paginationResult = parsePaginationParams(url.searchParams)
  if (!paginationResult.ok) {
    return NextResponse.json({ success: false, error: paginationResult.error }, { status: 400 })
  }

  const status = statusRaw ? normalizeExternalJobStatus(statusRaw) : null
  if (statusRaw && !status) {
    return NextResponse.json({ success: false, error: 'Invalid status filter' }, { status: 400 })
  }

  if (kind && kind !== 'field_check') {
    return NextResponse.json({ success: false, error: 'Invalid kind filter' }, { status: 400 })
  }

  if (provider && !(EXTERNAL_PROVIDERS as readonly string[]).includes(provider)) {
    return NextResponse.json({ success: false, error: 'Invalid provider filter' }, { status: 400 })
  }

  if (providerEnv && !['live', 'sandbox'].includes(providerEnv)) {
    return NextResponse.json({ success: false, error: 'Invalid provider_env filter' }, { status: 400 })
  }

  const linkedIdValues = [
    ['bounty_id', bountyId],
    ['booking_id', bookingId],
    ['application_id', applicationId],
    ['conversation_id', conversationId],
  ] as const

  for (const [name, value] of linkedIdValues) {
    if (!value) continue
    const parsed = z.string().uuid().safeParse(value)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: `Invalid ${name} filter` }, { status: 400 })
    }
  }

  const { limit, offset } = paginationResult.value

  let query = supabase
    .from('external_jobs')
    .select('*', { count: 'exact' })
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (kind) query = query.eq('kind', kind)
  if (status) query = query.eq('status', status)
  if (provider) query = query.eq('provider', provider)
  if (providerEnv) query = query.eq('provider_env', providerEnv)
  if (bountyId) query = query.eq('bounty_id', bountyId)
  if (bookingId) query = query.eq('booking_id', bookingId)
  if (applicationId) query = query.eq('application_id', applicationId)
  if (conversationId) query = query.eq('conversation_id', conversationId)

  const { data, error, count } = await query
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: data ?? [],
    pagination: {
      total: count ?? 0,
      limit,
      offset,
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireOwnerAgentAccess(request, 'write', { createIfMissing: true })
  if (!auth.ok) return auth.response
  const { actingAgentId: agentId, serviceClient: supabase, authMode } = auth.context
  const toolSource = resolveToolPolicySourceFromHeaders(request.headers)

  const schema = await ensureExternalIntegrationsSchema({ supabase })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
  }

  if (authMode === 'agent') {
    const policy = await loadAgentToolPolicy(supabase, agentId)
    const provider = parsed.data.provider === 'wegolook' ? 'wegolook' : 'proxypics'

    const decision = evaluateExternalJobsPolicy({ policy, provider })

    if (!decision.allowed) {
      await writeAgentToolAuditLogBestEffort(supabase, {
        agentId,
        toolName: 'create_external_job',
        decision: 'blocked',
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        provider,
        source: toolSource,
        metadata: { kind: parsed.data.kind, provider_env: parsed.data.provider_env ?? 'live' },
      })

      return NextResponse.json(
        { success: false, error: decision.reason, code: 'TOOL_POLICY_BLOCKED' },
        { status: 403 }
      )
    }

    if (toolSource === 'api') {
      await writeAgentToolAuditLogBestEffort(supabase, {
        agentId,
        toolName: 'create_external_job',
        decision: 'allowed',
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        provider,
        source: toolSource,
        metadata: { kind: parsed.data.kind, provider_env: parsed.data.provider_env ?? 'live' },
      })
    }
  }

  try {
    const result = await createFieldCheckExternalJob(supabase, {
      agentId,
      input: parsed.data,
    })

    return NextResponse.json({ success: true, data: result.job })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create external job' },
      { status: 500 }
    )
  }
}
