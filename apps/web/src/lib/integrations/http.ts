import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireOwnerAgentAccess, type OwnerAgentAccess, type OwnerAgentAuthContext } from '@/lib/owner-agent-auth'
import { EXTERNAL_PROVIDER_IDS } from '@/lib/external-jobs/providers/registry'

export const integrationProviderSchema = z.enum(EXTERNAL_PROVIDER_IDS)
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>

export interface IntegrationProviderAccessContext {
  provider: IntegrationProvider
  actingAgentId: OwnerAgentAuthContext['actingAgentId']
  serviceClient: OwnerAgentAuthContext['serviceClient']
}

export type IntegrationProviderAccessResult =
  | { ok: true; context: IntegrationProviderAccessContext }
  | { ok: false; response: NextResponse }

export async function requireIntegrationProviderAccess(
  request: NextRequest,
  params: Promise<{ provider: string }>,
  access: OwnerAgentAccess
): Promise<IntegrationProviderAccessResult> {
  const { provider: rawProvider } = await params
  const parsedProvider = integrationProviderSchema.safeParse(rawProvider)
  if (!parsedProvider.success) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unknown provider' }, { status: 404 }),
    }
  }

  const auth = await requireOwnerAgentAccess(request, access, { createIfMissing: true })
  if (!auth.ok) return auth

  return {
    ok: true,
    context: {
      provider: parsedProvider.data,
      actingAgentId: auth.context.actingAgentId,
      serviceClient: auth.context.serviceClient,
    },
  }
}
