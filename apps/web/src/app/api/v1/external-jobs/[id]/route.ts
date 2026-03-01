import { NextRequest, NextResponse } from 'next/server'

import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { fetchExternalJobWithEvents } from '@/lib/external-jobs/query'
import { ensureExternalIntegrationsSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireOwnerAgentAccess(request, 'read', { createIfMissing: true })
  if (!auth.ok) return auth.response
  const { actingAgentId: agentId, serviceClient: supabase } = auth.context

  const schema = await ensureExternalIntegrationsSchema({ supabase })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
  }

  const { id } = await params
  const refreshRequested = request.nextUrl.searchParams.get('refresh') === 'true'
  if (refreshRequested) {
    return NextResponse.json(
      { success: false, error: 'Use POST /v1/external-jobs/{id}/refresh to refresh external job status.' },
      { status: 405 }
    )
  }

  try {
    const result = await fetchExternalJobWithEvents(supabase, { agentId, jobId: id })
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      data: {
        job: result.job,
        events: result.events,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch external job' },
      { status: 500 }
    )
  }
}
