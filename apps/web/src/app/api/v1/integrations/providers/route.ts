import { NextRequest, NextResponse } from 'next/server'

import { listExternalProviderDescriptors } from '@/lib/external-jobs/providers/registry'
import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import { ensureExternalIntegrationsConfigSchema, toSchemaParityErrorBody } from '@/lib/schema-parity'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireOwnerAgentAccess(request, 'read', { createIfMissing: true })
  if (!auth.ok) return auth.response
  const { actingAgentId, serviceClient } = auth.context

  const schema = await ensureExternalIntegrationsConfigSchema({ supabase: serviceClient })
  if (!schema.ok) {
    return NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 })
  }

  const descriptors = listExternalProviderDescriptors()

  const { data, error } = await serviceClient
    .from('external_integrations')
    .select('provider, env, credentials_mask, is_active, updated_at')
    .eq('agent_id', actingAgentId)
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
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

  return NextResponse.json({ success: true, data: providerStatus })
}
