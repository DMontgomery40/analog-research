import { NextRequest, NextResponse } from 'next/server'

import { listExternalProviderDescriptors } from '@/lib/external-jobs/providers/registry'
import { normalizeError, toPublicErrorPayload, withRequestId } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { ensureExternalIntegrationsConfigSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { log, requestId } = logger.withRequest(
    request,
    'api/v1/integrations/providers/route.ts',
    'GET'
  )
  const auth = await requireOwnerAgentAccess(request, 'read', { createIfMissing: true })
  if (!auth.ok) return withRequestId(auth.response, requestId)
  const { actingAgentId, serviceClient } = auth.context

  const schema = await ensureExternalIntegrationsConfigSchema({ supabase: serviceClient })
  if (!schema.ok) {
    return withRequestId(
      NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 }),
      requestId
    )
  }

  const descriptors = listExternalProviderDescriptors()

  const { data, error } = await serviceClient
    .from('external_integrations')
    .select('provider, env, credentials_mask, is_active, updated_at')
    .eq('agent_id', actingAgentId)
    .eq('is_active', true)

  if (error) {
    const normalized = normalizeError(error, {
      message: 'Failed to list integration providers',
      operatorHint:
        'GET integrations/providers -> external_integrations select for actingAgentId before providerStatus mapping',
      requestId,
      status: 500,
    })

    log.error('Integration providers query failed', { actingAgentId }, normalized)

    return withRequestId(
      NextResponse.json(toPublicErrorPayload(normalized), { status: normalized.status ?? 500 }),
      requestId
    )
  }

  const rows = data ?? []

  const providerStatus = descriptors.map((descriptor) => {
    const configuredEnvs = descriptor.supportedEnvs.map((env) => {
      const match = rows.find((row) => row.provider === descriptor.id && row.env === env)
      return {
        env,
        configured: Boolean(match),
        credentials_mask: match?.credentials_mask ?? null,
        updated_at: match?.updated_at ?? null,
      }
    })

    return {
      ...descriptor,
      configured_envs: configuredEnvs,
    }
  })

  return withRequestId(NextResponse.json({ success: true, data: providerStatus }), requestId)
}
