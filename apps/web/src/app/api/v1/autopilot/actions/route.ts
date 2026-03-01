import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolveSessionOwnerAgent } from '@/lib/session-owner-agent'
import { ensureAutopilotActivitySchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export const runtime = 'nodejs'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

type AutopilotAuditRow = {
  id: string
  agent_id: string
  run_id: string | null
  config_id: string | null
  action_type: string
  action_status: string
  inputs: Record<string, unknown> | null
  decision: Record<string, unknown> | null
  result_ids: Record<string, unknown> | null
  created_at: string
}

const getActionRef = (row: AutopilotAuditRow) => {
  if (row.action_type === 'create_bounty' || row.action_type === 'cancel_planned_action') {
    const actionKey = row.inputs?.action_key
    if (typeof actionKey === 'string' && actionKey.length > 0) {
      return `create_bounty:${actionKey}`
    }
  }

  const applicationId =
    (row.inputs?.application_id as string | undefined) ||
    (row.result_ids?.application_id as string | undefined)

  if (applicationId) {
    return `application:${applicationId}`
  }

  if (row.action_type === 'plan_created' && row.run_id) {
    return `plan:${row.run_id}`
  }

  return `${row.action_type}:${row.id}`
}

const coerceConfigEnabled = (value: unknown) => Boolean(value)

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()))

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const serviceClient = await createServiceClient()
  const ownerAgent = await resolveSessionOwnerAgent(serviceClient, user.id)

  if (!ownerAgent) {
    return NextResponse.json({ success: false, error: 'Owner agent profile not found' }, { status: 403 })
  }

  const schema = await ensureAutopilotActivitySchema({ supabase: serviceClient })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
  }

  const limit = parsed.data.limit
  const fetchLimit = Math.min(limit * 3, 300)

  const { data: auditRows, error } = await serviceClient
    .from('agent_autopilot_audit_log')
    .select('id, agent_id, run_id, config_id, action_type, action_status, inputs, decision, result_ids, created_at')
    .eq('agent_id', ownerAgent.agentId)
    .order('created_at', { ascending: false })
    .limit(fetchLimit)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const rows = (auditRows || []) as AutopilotAuditRow[]
  const grouped = new Map<string, AutopilotAuditRow>()

  for (const row of rows) {
    const key = getActionRef(row)
    const existing = grouped.get(key)
    if (!existing || new Date(row.created_at).getTime() > new Date(existing.created_at).getTime()) {
      grouped.set(key, row)
    }
  }

  const deduped = Array.from(grouped.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)

  const configIds = Array.from(new Set(deduped.map((row) => row.config_id).filter(Boolean))) as string[]
  const configEnabledById = new Map<string, boolean>()

  if (configIds.length > 0) {
    const { data: configs, error: configsError } = await serviceClient
      .from('agent_autopilot_configs')
      .select('id, enabled')
      .eq('agent_id', ownerAgent.agentId)
      .in('id', configIds)

    if (configsError) {
      return NextResponse.json({ success: false, error: configsError.message }, { status: 500 })
    }

    ;(configs || []).forEach((config: { id: string; enabled: boolean }) => {
      configEnabledById.set(config.id, coerceConfigEnabled(config.enabled))
    })
  }

  const actions = deduped.map((row) => {
    const inputs = row.inputs ?? {}
    const isPlannedBounty = row.action_type === 'create_bounty' && row.action_status === 'planned'
    const hasActionKey = typeof inputs.action_key === 'string'

    let rollback: { allowed: boolean; type: string; label: string } | null = null

    if (isPlannedBounty && hasActionKey) {
      rollback = {
        allowed: true,
        type: 'cancel_planned_action',
        label: 'Cancel planned bounty',
      }
    } else if (row.action_status === 'requires_approval' && typeof inputs.application_id === 'string') {
      rollback = {
        allowed: true,
        type: 'reject_application',
        label: 'Reject application',
      }
    } else if (row.config_id && configEnabledById.get(row.config_id)) {
      rollback = {
        allowed: true,
        type: 'disable_autopilot_config',
        label: 'Disable autopilot',
      }
    }

    return {
      ...row,
      rollback,
    }
  })

  return NextResponse.json({
    success: true,
    data: {
      actions,
      limit,
    },
  })
}
