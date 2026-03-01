import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { encryptIntegrationCredentials } from '@/lib/integrations-secrets'
import { parseIntegrationCredentialUpdate, buildIntegrationCredentialsMask } from '@/lib/integrations/credentials'
import { logger } from '@/lib/logger'
import { requireTalentProviderAccess } from '@/lib/talent-connectors/http'
import { getTalentProviderPlugin } from '@/lib/talent-connectors/providers/registry'
import type { ExternalProviderDescriptor } from '@/lib/external-jobs/providers/types'

export const runtime = 'nodejs'

const log = logger.withContext('api/v1/talent-connectors/providers/[provider]/route.ts', 'PUT')

const bodySchema = z.object({
  env: z.enum(['live', 'sandbox']).optional(),
  credentials: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  api_key: z.string().min(1).max(500).optional(),
  apiKey: z.string().min(1).max(500).optional(),
}).passthrough()

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const guard = await requireTalentProviderAccess(request, params, 'write')
  if (!guard.ok) return guard.response
  const { actingAgentId, serviceClient, provider } = guard.context

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

  const plugin = getTalentProviderPlugin(provider)
  // Talent descriptors share credentialFields shape with ExternalProviderDescriptor
  const descriptorCompat = {
    ...plugin.descriptor,
    id: provider,
    status: plugin.descriptor.status === 'partner_onboarding' ? 'planned' : plugin.descriptor.status,
    capabilities: {},
  } as unknown as ExternalProviderDescriptor

  const credentialUpdate = parseIntegrationCredentialUpdate({
    descriptor: descriptorCompat,
    body: parsed.data,
  })
  if (!credentialUpdate.ok) {
    return NextResponse.json({ success: false, error: credentialUpdate.error }, { status: 400 })
  }

  const validation = plugin.validateCredentials(credentialUpdate.value.credentials)
  if (!validation.ok) {
    return NextResponse.json({ success: false, error: validation.error }, { status: 400 })
  }

  const encrypted = encryptIntegrationCredentials(credentialUpdate.value.credentials)
  const credentialsMask = buildIntegrationCredentialsMask(descriptorCompat, credentialUpdate.value.credentials)

  const { data, error } = await serviceClient
    .from('external_integrations')
    .upsert({
      agent_id: actingAgentId,
      provider,
      env: credentialUpdate.value.env,
      credentials_encrypted: encrypted,
      credentials_mask: credentialsMask,
      is_active: true,
    }, { onConflict: 'agent_id,provider,env' })
    .select('provider, env, credentials_mask, is_active, created_at, updated_at')
    .single()

  if (error) {
    log.error('Failed to upsert credentials', { provider, env: credentialUpdate.value.env, agentId: actingAgentId }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
