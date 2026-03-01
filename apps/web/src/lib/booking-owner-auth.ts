import { NextRequest, NextResponse } from 'next/server'

import { authenticateAgent, hasAgentScope } from '@/lib/api-auth'
import { resolveSessionOwnerAgent } from '@/lib/session-owner-agent'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'

export interface BookingOwnerAuthContext {
  actingAgentId: string
  authMode: 'agent' | 'human'
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>
}

interface BookingOwnerAuthResult {
  context: BookingOwnerAuthContext | null
  errorResponse: NextResponse | null
}

export async function requireBookingOwnerWriteAccess(
  request: NextRequest
): Promise<BookingOwnerAuthResult> {
  const agent = await authenticateAgent(request)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const serviceClient = await createServiceClient()

  if (agent) {
    if (!hasAgentScope(agent, 'write')) {
      return {
        context: null,
        errorResponse: NextResponse.json(
          { success: false, error: 'Insufficient permissions' },
          { status: 403 }
        ),
      }
    }

    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) {
      return { context: null, errorResponse: rateLimitResponse }
    }

    return {
      context: {
        actingAgentId: agent.agentId,
        authMode: 'agent',
        serviceClient,
      },
      errorResponse: null,
    }
  }

  if (user) {
    const ownerAgent = await resolveSessionOwnerAgent(serviceClient, user.id)
    if (!ownerAgent) {
      return {
        context: null,
        errorResponse: NextResponse.json(
          { success: false, error: 'Owner agent profile not found' },
          { status: 403 }
        ),
      }
    }

    return {
      context: {
        actingAgentId: ownerAgent.agentId,
        authMode: 'human',
        serviceClient,
      },
      errorResponse: null,
    }
  }

  return {
    context: null,
    errorResponse: NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    ),
  }
}
