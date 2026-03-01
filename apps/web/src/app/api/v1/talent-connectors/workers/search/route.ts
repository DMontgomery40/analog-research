import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireTalentConnectorAccess } from '@/lib/talent-connectors/http'
import { searchTalentWorkers } from '@/lib/talent-connectors/service'
import { isTalentProvider } from '@/lib/talent-connectors/types'
import { TALENT_ERROR_CODES } from '@/lib/talent-connectors/types'
import { ensureExternalIntegrationsConfigSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export const runtime = 'nodejs'

const querySchema = z.object({
  provider: z.string(),
  env: z.enum(['live', 'sandbox']).default('live'),
  q: z.string().min(1),
  skills: z.string().optional(),
  location: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function GET(request: NextRequest) {
  const guard = await requireTalentConnectorAccess(request, 'read')
  if (!guard.ok) return guard.response
  const { actingAgentId, serviceClient } = guard.context

  // Also need external_integrations for credential lookup
  const eiSchema = await ensureExternalIntegrationsConfigSchema({ supabase: serviceClient })
  if (!eiSchema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(eiSchema), { status: 503 })
  }

  const url = new URL(request.url)
  const rawParams = Object.fromEntries(url.searchParams.entries())

  let params: z.infer<typeof querySchema>
  try {
    params = querySchema.parse(rawParams)
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid query parameters' }, { status: 400 })
  }

  if (!isTalentProvider(params.provider)) {
    return NextResponse.json(
      { success: false, error: `Unknown talent provider: ${params.provider}`, code: TALENT_ERROR_CODES.TALENT_PROVIDER_UNKNOWN },
      { status: 400 },
    )
  }

  const skills = params.skills ? params.skills.split(',').map((s) => s.trim()).filter(Boolean) : undefined

  const result = await searchTalentWorkers(serviceClient, actingAgentId, params.provider, params.env, {
    query: params.q,
    skills,
    location: params.location,
    limit: params.limit,
    offset: params.offset,
  })

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error, ...(result.code && { code: result.code }) },
      { status: 422 },
    )
  }

  return NextResponse.json({ success: true, data: result.data })
}
