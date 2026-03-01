import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getExternalProviderPlugin } from '@/lib/external-jobs/providers/registry'
import { requireIntegrationProviderAccess } from '@/lib/integrations/http'
import { buildIntegrationCredentialsMask, parseIntegrationCredentialUpdate } from '@/lib/integrations/credentials'
import { encryptIntegrationCredentials } from '@/lib/integrations-secrets'
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
  const access = await requireIntegrationProviderAccess(request, params, 'read')
  if (!access.ok) return access.response
  const { provider, actingAgentId, serviceClient } = access.context

  const schema = await ensureExternalIntegrationsConfigSchema({ supabase: serviceClient })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: `Integration not configured for ${provider} (${env})` },
      { status: 404 }
    )
  }

  return NextResponse.json({ success: true, data })
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const access = await requireIntegrationProviderAccess(request, params, 'write')
  if (!access.ok) return access.response
  const { provider, actingAgentId, serviceClient } = access.context

  const schema = await ensureExternalIntegrationsConfigSchema({ supabase: serviceClient })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
  }

  const plugin = getExternalProviderPlugin(provider)
  const credentialUpdate = parseIntegrationCredentialUpdate({
    descriptor: plugin.descriptor,
    body: parsed.data,
  })
  if (!credentialUpdate.ok) {
    return NextResponse.json({ success: false, error: credentialUpdate.error }, { status: 400 })
  }

  const validatedCredentials = plugin.validateCredentials(credentialUpdate.value.credentials)
  if (!validatedCredentials.ok) {
    return NextResponse.json({ success: false, error: validatedCredentials.error }, { status: 400 })
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
    return NextResponse.json({ success: false, error: error?.message || 'Failed to upsert integration' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const access = await requireIntegrationProviderAccess(request, params, 'write')
  if (!access.ok) return access.response
  const { provider, actingAgentId, serviceClient } = access.context

  const schema = await ensureExternalIntegrationsConfigSchema({ supabase: serviceClient })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: { provider, env, deleted: true } })
}
