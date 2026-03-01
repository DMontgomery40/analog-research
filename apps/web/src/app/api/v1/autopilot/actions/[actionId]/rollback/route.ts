import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolveSessionOwnerAgent } from '@/lib/session-owner-agent'
import { buildPendingBountyActionKey } from '@/lib/autopilot/action-keys'
import { createAutopilotNotification } from '@/lib/autopilot/notifications'
import { rejectApplicationAsAgent } from '@/lib/bounties/application-actions'
import { ensureAutopilotActivitySchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export const runtime = 'nodejs'

const rollbackSchema = z.object({
  rollback_type: z.enum([
    'cancel_planned_action',
    'reject_application',
    'disable_autopilot_config',
  ]),
})

type AuditRow = {
  id: string
  agent_id: string
  run_id: string | null
  config_id: string | null
  action_type: string
  action_status: string
  inputs: Record<string, unknown> | null
  created_at: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  const { actionId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = rollbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body', details: parsed.error.flatten() },
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

  const { data: actionRow, error: actionError } = await serviceClient
    .from('agent_autopilot_audit_log')
    .select('id, agent_id, run_id, config_id, action_type, action_status, inputs, created_at')
    .eq('id', actionId)
    .eq('agent_id', ownerAgent.agentId)
    .maybeSingle()

  if (actionError) {
    return NextResponse.json({ success: false, error: actionError.message }, { status: 500 })
  }

  if (!actionRow) {
    return NextResponse.json({ success: false, error: 'Action not found' }, { status: 404 })
  }

  const action = actionRow as AuditRow
  const inputs = action.inputs ?? {}
  const rollbackType = parsed.data.rollback_type

  if (rollbackType === 'cancel_planned_action') {
    if (action.action_type !== 'create_bounty' || action.action_status !== 'planned') {
      return NextResponse.json({ success: false, error: 'Action cannot be cancelled' }, { status: 409 })
    }

    const actionKey = inputs.action_key
    if (typeof actionKey !== 'string') {
      return NextResponse.json({ success: false, error: 'Action key missing' }, { status: 400 })
    }

    const { data: stateRow, error: stateError } = await serviceClient
      .from('agent_autopilot_state')
      .select('id, state')
      .eq('agent_id', ownerAgent.agentId)
      .maybeSingle()

    if (stateError) {
      return NextResponse.json({ success: false, error: stateError.message }, { status: 500 })
    }

    if (!stateRow) {
      return NextResponse.json({ success: false, error: 'Autopilot state not found' }, { status: 404 })
    }

    const pendingSeeds = Array.isArray(stateRow.state?.pending_bounties)
      ? (stateRow.state?.pending_bounties as unknown[])
      : []

    const updatedSeeds = pendingSeeds.filter((seed, index) => {
      return buildPendingBountyActionKey(seed, index) !== actionKey
    })

    if (updatedSeeds.length === pendingSeeds.length) {
      return NextResponse.json({ success: false, error: 'Planned action no longer available' }, { status: 409 })
    }

    const nextState = {
      ...(stateRow.state || {}),
      pending_bounties: updatedSeeds,
    }

    const { error: updateError } = await serviceClient
      .from('agent_autopilot_state')
      .update({ state: nextState })
      .eq('id', stateRow.id)

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }

    await serviceClient.from('agent_autopilot_audit_log').insert({
      agent_id: ownerAgent.agentId,
      run_id: action.run_id,
      config_id: action.config_id,
      action_type: 'cancel_planned_action',
      action_status: 'executed',
      inputs: { action_id: action.id, action_key: actionKey },
      decision: { rollback_type: rollbackType },
      result_ids: {},
    })

    await createAutopilotNotification({
      supabase: serviceClient,
      agentId: ownerAgent.agentId,
      title: 'Autopilot action cancelled',
      body: 'A planned bounty was removed from the queue.',
      data: {
        action_id: action.id,
        rollback_type: rollbackType,
      },
    })

    return NextResponse.json({ success: true })
  }

  if (rollbackType === 'reject_application') {
    if (typeof inputs.application_id !== 'string' || typeof inputs.bounty_id !== 'string') {
      return NextResponse.json({ success: false, error: 'Application details missing' }, { status: 400 })
    }

    const applicationId = inputs.application_id
    const bountyId = inputs.bounty_id

    const { data: bounty, error: bountyError } = await serviceClient
      .from('bounties')
      .select('id, agent_id, title')
      .eq('id', bountyId)
      .maybeSingle()

    if (bountyError) {
      return NextResponse.json({ success: false, error: bountyError.message }, { status: 500 })
    }

    if (!bounty || bounty.agent_id !== ownerAgent.agentId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: application, error: applicationError } = await serviceClient
      .from('applications')
      .select('id, status')
      .eq('id', applicationId)
      .eq('bounty_id', bountyId)
      .maybeSingle()

    if (applicationError) {
      return NextResponse.json({ success: false, error: applicationError.message }, { status: 500 })
    }

    if (!application) {
      return NextResponse.json({ success: false, error: 'Application not found' }, { status: 404 })
    }

    if (application.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Application is no longer pending' }, { status: 409 })
    }

    const rejectResult = await rejectApplicationAsAgent({
      supabase: serviceClient,
      agentId: ownerAgent.agentId,
      bountyId,
      applicationId,
    })

    if (!rejectResult.ok) {
      return NextResponse.json({ success: false, error: rejectResult.error }, { status: rejectResult.status })
    }

    await serviceClient.from('agent_autopilot_audit_log').insert({
      agent_id: ownerAgent.agentId,
      run_id: action.run_id,
      config_id: action.config_id,
      action_type: 'rollback_action',
      action_status: 'executed',
      inputs: { action_id: action.id, application_id: applicationId, bounty_id: bountyId },
      decision: { rollback_type: rollbackType },
      result_ids: { application_id: applicationId },
    })

    await createAutopilotNotification({
      supabase: serviceClient,
      agentId: ownerAgent.agentId,
      title: 'Autopilot application rejected',
      body: bounty?.title ? `"${bounty.title}"` : null,
      data: {
        action_id: action.id,
        rollback_type: rollbackType,
        application_id: applicationId,
        bounty_id: bountyId,
      },
    })

    return NextResponse.json({ success: true })
  }

  if (!action.config_id) {
    return NextResponse.json({ success: false, error: 'Autopilot config missing' }, { status: 400 })
  }

  const { data: config, error: configError } = await serviceClient
    .from('agent_autopilot_configs')
    .select('id, enabled')
    .eq('id', action.config_id)
    .eq('agent_id', ownerAgent.agentId)
    .maybeSingle()

  if (configError) {
    return NextResponse.json({ success: false, error: configError.message }, { status: 500 })
  }

  if (!config) {
    return NextResponse.json({ success: false, error: 'Autopilot config not found' }, { status: 404 })
  }

  if (!config.enabled) {
    return NextResponse.json({ success: false, error: 'Autopilot is already disabled' }, { status: 409 })
  }

  const { error: updateError } = await serviceClient
    .from('agent_autopilot_configs')
    .update({ enabled: false })
    .eq('id', action.config_id)

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  await serviceClient.from('agent_autopilot_audit_log').insert({
    agent_id: ownerAgent.agentId,
    run_id: action.run_id,
    config_id: action.config_id,
    action_type: 'disable_autopilot',
    action_status: 'executed',
    inputs: { action_id: action.id, config_id: action.config_id },
    decision: { rollback_type: rollbackType },
    result_ids: {},
  })

  await createAutopilotNotification({
    supabase: serviceClient,
    agentId: ownerAgent.agentId,
    title: 'Autopilot disabled',
    body: 'Autopilot has been turned off for this ResearchAgent.',
    data: {
      action_id: action.id,
      rollback_type: rollbackType,
      config_id: action.config_id,
    },
  })

  return NextResponse.json({ success: true })
}
