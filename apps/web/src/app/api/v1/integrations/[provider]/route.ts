import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { AppError, normalizeError, toPublicErrorPayload, withRequestId } from '@/lib/errors'
import { getExternalProviderPlugin } from '@/lib/external-jobs/providers/registry'
import { requireIntegrationProviderAccess } from '@/lib/integrations/http'
import { buildIntegrationCredentialsMask, parseIntegrationCredentialUpdate } from '@/lib/integrations/credentials'
import { encryptIntegrationCredentials } from '@/lib/integrations-secrets'
import { logger } from '@/lib/logger'
import { ensureExternalIntegrationsConfigSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export const runtime = 'nodejs'

const upsertSchema = z.object({
  env: z.enum(['live', 'sandbox']).optional(),
  api_key: z.string().min(1).max(500).optional(),
  apiKey: z.string().min(1).max(500).optional(),
  credentials: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
}).passthrough()

interface RouteParams {
  params: Promise<{ provider: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { log, requestId } = logger.withRequest(request, 'api/v1/integrations/[provider]/route.ts', 'GET')
  const access = await requireIntegrationProviderAccess(request, params, 'read')
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

  const { data, error } = await serviceClient
    .from('external_integrations')
    .select('provider, env, credentials_mask, is_active, created_at, updated_at')
    .eq('agent_id', actingAgentId)
    .eq('provider', provider)
    .eq('env', env)
    .maybeSingle()

  if (error) {
    const normalized = normalizeError(error, {
      message: 'Failed to load integration',
      operatorHint:
        'GET integrations/[provider] -> external_integrations maybeSingle for actingAgentId/provider/env',
      requestId,
      status: 500,
    })

    log.error('Integration lookup failed', { actingAgentId, provider, env }, normalized)

    return withRequestId(
      NextResponse.json(toPublicErrorPayload(normalized), { status: normalized.status ?? 500 }),
      requestId
    )
  }

  if (!data) {
    return withRequestId(
      NextResponse.json(
        toPublicErrorPayload(
          new AppError(`Integration not configured for ${provider} (${env})`, {
            status: 404,
            operatorHint:
              'GET integrations/[provider] expected an active external_integrations row for actingAgentId/provider/env',
            requestId,
          })
        ),
        { status: 404 }
      ),
      requestId
    )
  }

  return withRequestId(NextResponse.json({ success: true, data }), requestId)
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { log, requestId } = logger.withRequest(request, 'api/v1/integrations/[provider]/route.ts', 'PUT')
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return withRequestId(
      NextResponse.json(
        toPublicErrorPayload(
          new AppError('Invalid JSON body', {
            status: 400,
            operatorHint:
              'PUT integrations/[provider] expects a JSON object body before credential parsing',
            requestId,
          })
        ),
        { status: 400 }
      ),
      requestId
    )
  }

  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) {
    return withRequestId(
      NextResponse.json(
        {
          ...toPublicErrorPayload(
            new AppError('Invalid request body', {
              status: 400,
              operatorHint:
                'PUT integrations/[provider] expects env/api_key or credentials before zod validation',
              requestId,
            })
          ),
          details: parsed.error.flatten(),
        },
        { status: 400 }
      ),
      requestId
    )
  }

  const plugin = getExternalProviderPlugin(provider)
  const credentialUpdate = parseIntegrationCredentialUpdate({
    descriptor: plugin.descriptor,
    body: parsed.data,
  })
  if (!credentialUpdate.ok) {
    return withRequestId(
      NextResponse.json(
        toPublicErrorPayload(
          new AppError(credentialUpdate.error, {
            status: 400,
            operatorHint: credentialUpdate.operatorHint,
            requestId,
          })
        ),
        { status: 400 }
      ),
      requestId
    )
  }

  const validatedCredentials = plugin.validateCredentials(credentialUpdate.value.credentials)
  if (!validatedCredentials.ok) {
    return withRequestId(
      NextResponse.json(
        toPublicErrorPayload(
          new AppError(validatedCredentials.error, {
            status: 400,
            operatorHint:
              'PUT integrations/[provider] -> plugin.validateCredentials rejected normalized credentials',
            requestId,
          })
        ),
        { status: 400 }
      ),
      requestId
    )
  }

  const encrypted = encryptIntegrationCredentials(credentialUpdate.value.credentials)
  const credentialsMask = buildIntegrationCredentialsMask(plugin.descriptor, credentialUpdate.value.credentials)

  const { data, error } = await serviceClient
    .from('external_integrations')
    .upsert(
      {
        agent_id: actingAgentId,
        provider,
        env: credentialUpdate.value.env,
        credentials_encrypted: encrypted,
        credentials_mask: credentialsMask,
        is_active: true,
      },
      { onConflict: 'agent_id,provider,env' }
    )
    .select('provider, env, credentials_mask, is_active, created_at, updated_at')
    .single()

  if (error || !data) {
    const normalized = normalizeError(error ?? new Error('Upsert returned no integration row'), {
      message: 'Failed to upsert integration',
      operatorHint:
        'PUT integrations/[provider] -> external_integrations upsert on agent_id/provider/env',
      requestId,
      status: 500,
    })

    log.error('Integration upsert failed', { actingAgentId, provider, env: credentialUpdate.value.env }, normalized)

    return withRequestId(
      NextResponse.json(toPublicErrorPayload(normalized), { status: normalized.status ?? 500 }),
      requestId
    )
  }

  return withRequestId(NextResponse.json({ success: true, data }), requestId)
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { log, requestId } = logger.withRequest(request, 'api/v1/integrations/[provider]/route.ts', 'DELETE')
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

  const { error } = await serviceClient
    .from('external_integrations')
    .delete()
    .eq('agent_id', actingAgentId)
    .eq('provider', provider)
    .eq('env', env)

  if (error) {
    const normalized = normalizeError(error, {
      message: 'Failed to delete integration',
      operatorHint:
        'DELETE integrations/[provider] -> external_integrations delete for actingAgentId/provider/env',
      requestId,
      status: 500,
    })

    log.error('Integration delete failed', { actingAgentId, provider, env }, normalized)

    return withRequestId(
      NextResponse.json(toPublicErrorPayload(normalized), { status: normalized.status ?? 500 }),
      requestId
    )
  }

  return withRequestId(
    NextResponse.json({ success: true, data: { provider, env, deleted: true } }),
    requestId
  )
}
