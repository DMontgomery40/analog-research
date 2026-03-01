import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const updateAgentPreferencesSchema = z.object({
  default_payment_method: z.enum(['stripe', 'crypto']).nullable(),
})

// GET /api/v1/agent/preferences
export async function GET(request: NextRequest) {
  const log = logger.withContext('api/v1/agent/preferences/route.ts', 'GET')
  const auth = await requireOwnerAgentAccess(request, 'read', { createIfMissing: true })
  if (!auth.ok) return auth.response
  const { actingAgentId, serviceClient } = auth.context

  const { data, error } = await serviceClient
    .from('agents')
    .select('id, default_payment_method')
    .eq('id', actingAgentId)
    .single()

  if (error || !data) {
    log.error('Failed to load agent preferences', { agentId: actingAgentId }, error || { message: 'No data' })
    return NextResponse.json({ success: false, error: 'Failed to load preferences' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      agent_id: data.id,
      default_payment_method: data.default_payment_method,
    },
  })
}

// PATCH /api/v1/agent/preferences
export async function PATCH(request: NextRequest) {
  const log = logger.withContext('api/v1/agent/preferences/route.ts', 'PATCH')
  const auth = await requireOwnerAgentAccess(request, 'write', { createIfMissing: true })
  if (!auth.ok) return auth.response
  const { actingAgentId, serviceClient } = auth.context

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = updateAgentPreferencesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
  }

  const { data, error } = await serviceClient
    .from('agents')
    .update({ default_payment_method: parsed.data.default_payment_method })
    .eq('id', actingAgentId)
    .select('id, default_payment_method')
    .single()

  if (error || !data) {
    log.error('Failed to update agent preferences', { agentId: actingAgentId }, error || { message: 'No data' })
    return NextResponse.json({ success: false, error: 'Failed to update preferences' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      agent_id: data.id,
      default_payment_method: data.default_payment_method,
    },
  })
}
