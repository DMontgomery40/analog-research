import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { EXTERNAL_PROVIDERS } from '@/lib/external-jobs/types'
import {
  DEFAULT_AGENT_TOOL_POLICY,
  TOOL_POLICY_SCHEMA_VERSION,
  agentToolPolicyV1Schema,
  loadAgentToolPolicy,
} from '@/lib/tool-policy'

export const runtime = 'nodejs'

const patchSchema = z.object({
  schema_version: z.literal(TOOL_POLICY_SCHEMA_VERSION).optional(),
  money: z.object({
    enabled: z.boolean().optional(),
    max_per_action_cents: z.number().int().min(0).optional(),
    max_daily_cents: z.number().int().min(0).optional(),
  }).optional(),
  external_jobs: z.object({
    enabled: z.boolean().optional(),
    allowed_providers: z.array(z.enum(EXTERNAL_PROVIDERS)).optional(),
  }).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireOwnerAgentAccess(request, 'read', { createIfMissing: true })
  if (!auth.ok) return auth.response

  const { actingAgentId: agentId, serviceClient: supabase } = auth.context

  const policy = await loadAgentToolPolicy(supabase, agentId)

  return NextResponse.json({
    success: true,
    data: {
      agent_id: agentId,
      policy,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireOwnerAgentAccess(request, 'write', { createIfMissing: true })
  if (!auth.ok) return auth.response

  const { actingAgentId: agentId, serviceClient: supabase } = auth.context

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsedPatch = patchSchema.safeParse(body)
  if (!parsedPatch.success) {
    return NextResponse.json({ success: false, error: parsedPatch.error.flatten() }, { status: 400 })
  }

  const current = await loadAgentToolPolicy(supabase, agentId)

  const nextPolicy = {
    ...current,
    schema_version: TOOL_POLICY_SCHEMA_VERSION,
    money: {
      ...current.money,
      ...(parsedPatch.data.money ?? {}),
    },
    external_jobs: {
      ...current.external_jobs,
      ...(parsedPatch.data.external_jobs ?? {}),
      allowed_providers: parsedPatch.data.external_jobs?.allowed_providers ?? current.external_jobs.allowed_providers,
    },
  }

  const validated = agentToolPolicyV1Schema.safeParse(nextPolicy)
  if (!validated.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid policy update' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('agent_tool_policies')
    .upsert({
      agent_id: agentId,
      schema_version: TOOL_POLICY_SCHEMA_VERSION,
      policy: validated.data,
    }, { onConflict: 'agent_id' })
    .select('policy')
    .single()

  if (error || !data?.policy) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update policy' }, { status: 500 })
  }

  const resultPolicy = agentToolPolicyV1Schema.safeParse(data.policy).success
    ? data.policy
    : DEFAULT_AGENT_TOOL_POLICY

  return NextResponse.json({
    success: true,
    data: {
      agent_id: agentId,
      policy: resultPolicy,
    },
  })
}
