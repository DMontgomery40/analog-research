import { NextRequest, NextResponse } from 'next/server'

import { authenticateAgent, hasAgentScope } from '@/lib/api-auth'
import { resolveOrCreateSessionOwnerAgent, resolveSessionOwnerAgent } from '@/lib/session-owner-agent'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'

export type OwnerAgentAccess = 'read' | 'write'

export interface OwnerAgentAuthContext {
  actingAgentId: string
  authMode: 'agent' | 'human'
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>
}

export type OwnerAgentAuthResult =
  | { ok: true; context: OwnerAgentAuthContext }
  | { ok: false; response: NextResponse }

export async function requireOwnerAgentAccess(
  request: NextRequest,
  access: OwnerAgentAccess,
  options?: { createIfMissing?: boolean }
): Promise<OwnerAgentAuthResult> {
  const agent = await authenticateAgent(request)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const serviceClient = await createServiceClient()

  if (agent) {
    const allowed = access === 'write'
      ? hasAgentScope(agent, 'write')
      : (hasAgentScope(agent, 'read') || hasAgentScope(agent, 'write'))

    if (!allowed) {
      return {
        ok: false,
        response: NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 }),
      }
    }

    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) {
      return { ok: false, response: rateLimitResponse }
    }

    return {
      ok: true,
      context: {
        actingAgentId: agent.agentId,
        authMode: 'agent',
        serviceClient,
      },
    }
  }

  if (user) {
    const ownerAgent = options?.createIfMissing
      ? await resolveOrCreateSessionOwnerAgent(serviceClient, user.id)
      : await resolveSessionOwnerAgent(serviceClient, user.id)

    if (!ownerAgent) {
      return {
        ok: false,
        response: NextResponse.json({ success: false, error: 'Owner agent profile not found' }, { status: 403 }),
      }
    }

    return {
      ok: true,
      context: {
        actingAgentId: ownerAgent.agentId,
        authMode: 'human',
        serviceClient,
      },
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
  }
}
