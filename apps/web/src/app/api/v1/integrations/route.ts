import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { ensureExternalIntegrationsConfigSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireOwnerAgentAccess(request, 'read', { createIfMissing: true })
  if (!auth.ok) return auth.response
  const { actingAgentId, serviceClient } = auth.context

  const schema = await ensureExternalIntegrationsConfigSchema({ supabase: serviceClient })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
  }

  const { data, error } = await serviceClient
    .from('external_integrations')
    .select('provider, env, credentials_mask, is_active, created_at, updated_at')
    .eq('agent_id', actingAgentId)
    .order('provider', { ascending: true })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 }
  )
}
