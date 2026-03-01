import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { sendExternalJobMessage } from '@/lib/external-jobs/service'
import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { handleExternalJobWriteJson } from '@/lib/external-jobs/http'
import { ensureExternalIntegrationsSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export const runtime = 'nodejs'

const bodySchema = z.object({
  text: z.string().min(1).max(2000),
})

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

  const { id: jobId } = await params

  const { data: job, error: jobError } = await supabase
    .from('external_jobs')
    .select('id')
    .eq('id', jobId)
    .eq('agent_id', agentId)
    .maybeSingle()

  if (jobError) {
    return NextResponse.json({ success: false, error: jobError.message }, { status: 500 })
  }

  if (!job) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('external_job_events')
    .select('id, source, event_name, payload, created_at')
    .eq('job_id', jobId)
    .eq('agent_id', agentId)
    .ilike('event_name', '%message%')
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const messages = (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    source: row.source,
    event_name: row.event_name,
    message: (row.payload as any)?.message ?? null,
    payload: row.payload ?? {},
  }))

  return NextResponse.json({ success: true, data: messages })
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
  }

  return handleExternalJobWriteJson(
    request,
    params,
    async ({ supabase, agentId, jobId }) => {
      const result = await sendExternalJobMessage(supabase, {
        agentId,
        jobId,
        text: parsed.data.text,
      })

      return { job: result.job, message: result.message }
    },
    { errorMessage: 'Failed to send message' }
  )
}
