import { NextRequest, NextResponse } from 'next/server'

import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { ensureExternalIntegrationsSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export interface ExternalJobWriteContext {
  agentId: string
  authMode: 'agent' | 'human'
  jobId: string
  supabase: any
}

export async function handleExternalJobWriteJson<T>(
  request: NextRequest,
  params: Promise<{ id: string }>,
  handler: (ctx: ExternalJobWriteContext) => Promise<T | NextResponse>,
  options: { errorMessage: string }
): Promise<NextResponse> {
  const auth = await requireOwnerAgentAccess(request, 'write', { createIfMissing: true })
  if (!auth.ok) return auth.response

  const { actingAgentId: agentId, authMode, serviceClient: supabase } = auth.context
  const { id: jobId } = await params

  const schema = await ensureExternalIntegrationsSchema({ supabase })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
  }

  try {
    const result = await handler({ agentId, authMode, jobId, supabase })
    if (result instanceof NextResponse) return result
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : options.errorMessage
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
