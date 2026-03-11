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

async function verifyIntegration(
  request: NextRequest,
  params: RouteParams['params'],
  method: 'GET' | 'POST'
) {
  const { log, requestId } = logger.withRequest(
    request,
    'api/v1/integrations/[provider]/verified/route.ts',
    method
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
        'Integration verification failed',
        { actingAgentId, provider, env, status: verification.status },
        responseError
      )
    } else {
      log.warn('Integration verification rejected', {
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

  return withRequestId(
    NextResponse.json({
      success: true,
      data: {
        provider,
        env,
        verified: true,
        verified_at: verification.verifiedAt,
      },
    }),
    requestId
  )
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return verifyIntegration(request, params, 'GET')
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return verifyIntegration(request, params, 'POST')
}
