import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { authenticateAgent, hasAgentScope, type AgentAuth } from '@/lib/api-auth'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'

export type SessionOrAgentAuthResult =
  | {
      ok: true
      supabase: SupabaseClient
      user: { id: string } | null
      agent: AgentAuth | null
    }
  | { ok: false; response: NextResponse }

export async function requireSessionOrAgent(
  request: NextRequest,
  options?: { agentScope?: 'read' | 'write' }
): Promise<SessionOrAgentAuthResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const agent = await authenticateAgent(request)

  if (!user && !agent) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  if (agent && options?.agentScope) {
    const scope = options.agentScope
    const allowed = scope === 'write'
      ? hasAgentScope(agent, 'write')
      : (hasAgentScope(agent, 'read') || hasAgentScope(agent, 'write'))

    if (!allowed) {
      return { ok: false, response: NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 }) }
    }

    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) {
      return { ok: false, response: rateLimitResponse }
    }
  }

  return {
    ok: true,
    supabase,
    user: user ? { id: user.id } : null,
    agent: agent ?? null,
  }
}

