import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { rejectExternalJob } from '@/lib/external-jobs/service'
import { ensureExternalIntegrationsSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export const runtime = 'nodejs'

const rejectSchema = z.object({
  reason: z.enum([
    'unspecified',
    'blurry_photo',
    'wrong_direction',
    'incorrect_property',
    'people_in_photo',
    'property_not_visible',
    'other',
  ]),
  clarification: z.string().max(2000).optional(),
}).refine((data) => {
  if (data.reason !== 'other') return true
  return Boolean(data.clarification && data.clarification.trim())
}, { message: 'clarification is required when reason=other' })

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireOwnerAgentAccess(request, 'write', { createIfMissing: true })
  if (!auth.ok) return auth.response
  const { actingAgentId: agentId, serviceClient: supabase } = auth.context

  const schema = await ensureExternalIntegrationsSchema({ supabase })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = rejectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await rejectExternalJob(supabase, {
      agentId,
      jobId: id,
      reason: parsed.data.reason,
      clarification: parsed.data.clarification,
    })
    return NextResponse.json({ success: true, data: result.job })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to reject external job' },
      { status: 500 }
    )
  }
}
