import { NextRequest, NextResponse } from 'next/server'

import { requireIntegrationProviderAccess } from '@/lib/integrations/http'
import { ensureExternalIntegrationsConfigSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'
import { verifyProviderConnection } from '@/lib/integrations/verify-provider'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ provider: string }>
}

async function verifyIntegration(
  request: NextRequest,
  params: RouteParams['params']
) {
  const access = await requireIntegrationProviderAccess(request, params, 'write')
  if (!access.ok) return access.response
  const { provider, actingAgentId, serviceClient } = access.context

  const schema = await ensureExternalIntegrationsConfigSchema({ supabase: serviceClient })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
  }

  const url = new URL(request.url)
  const env = url.searchParams.get('env') === 'sandbox' ? 'sandbox' : 'live'

  const verification = await verifyProviderConnection({
    serviceClient,
    actingAgentId,
    provider,
    env,
  })

  if (!verification.ok) {
    return NextResponse.json(
      { success: false, error: verification.error },
      { status: verification.status }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      provider,
      env,
      verified: true,
      verified_at: verification.verifiedAt,
    },
  })
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return verifyIntegration(request, params)
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return verifyIntegration(request, params)
}
