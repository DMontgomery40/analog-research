import { NextRequest, NextResponse } from 'next/server'

import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { parsePaginationParams } from '@/lib/request-params'
import { listProxyPicsTemplates } from '@/lib/external-jobs/service'
import { ensureExternalIntegrationsConfigSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireOwnerAgentAccess(request, 'read', { createIfMissing: true })
  if (!auth.ok) return auth.response
  const { actingAgentId: agentId, serviceClient } = auth.context

  const schema = await ensureExternalIntegrationsConfigSchema({ supabase: serviceClient })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
  }

  const url = new URL(request.url)
  const providerEnv = url.searchParams.get('env') === 'sandbox' ? 'sandbox' : 'live'

  const paginationResult = parsePaginationParams(url.searchParams)
  if (!paginationResult.ok) {
    return NextResponse.json({ success: false, error: paginationResult.error }, { status: 400 })
  }

  // ProxyPics uses page/per_page (1-indexed); we approximate.
  const perPage = paginationResult.value.limit
  const page = Math.floor(paginationResult.value.offset / perPage) + 1

  try {
    const result = await listProxyPicsTemplates(serviceClient, {
      agentId,
      providerEnv,
      page,
      perPage,
    })

    return NextResponse.json({
      success: true,
      data: result.data ?? [],
      meta: result.meta ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list templates' },
      { status: 500 }
    )
  }
}
