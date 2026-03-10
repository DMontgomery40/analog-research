import { NextRequest, NextResponse } from 'next/server'

import { AppError, toPublicErrorPayload, withRequestId } from '@/lib/errors'
import { requireIntegrationProviderAccess } from '@/lib/integrations/http'
import { ensureExternalIntegrationsConfigSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'
import { verifyProviderConnection } from '@/lib/integrations/verify-provider'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ provider: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { log, requestId } = logger.withRequest(
    request,
    'api/v1/integrations/[provider]/test/route.ts',
    'POST'
  )
  const access = await requireIntegrationProviderAccess(request, params, 'write')
  if (!access.ok) return withRequestId(access.response, requestId)
  const { provider, actingAgentId, serviceClient } = access.context

  const schema = await ensureExternalIntegrationsConfigSchema({ supabase: serviceClient })
  if (!schema.ok) {
    return withRequestId(
      NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 }),
      requestId
    )
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
    const responseError = new AppError(verification.error, {
      status: verification.status,
      operatorHint: verification.operatorHint,
      requestId,
    })

    if (verification.status >= 500) {
      log.error(
        'Integration test connection failed',
        { actingAgentId, provider, env, status: verification.status },
        responseError
      )
    } else {
      log.warn('Integration test connection rejected', {
        actingAgentId,
        provider,
        env,
        status: verification.status,
        operatorHint: verification.operatorHint,
      })
    }

    return withRequestId(
      NextResponse.json(toPublicErrorPayload(responseError), { status: verification.status }),
      requestId
    )
  }

  return withRequestId(NextResponse.json({ success: true, data: { ok: true } }), requestId)
}
