import { NextRequest, NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { buildAuthorizeUrl, createLinkStateToken, getMcpOauthLinkConfig } from '@/lib/mcp/oauth-link'
import { resolveOrCreateSessionOwnerAgent } from '@/lib/session-owner-agent'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const LINK_STATE_TTL_MINUTES = 10

export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/mcp/oauth/link/start/route.ts', 'POST')

  const config = getMcpOauthLinkConfig(request.nextUrl.origin)
  if (!config) {
    return NextResponse.json({
      success: false,
      error: 'MCP OAuth linking is not configured',
    }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = await createServiceClient()
  const ownerAgent = await resolveOrCreateSessionOwnerAgent(serviceClient, user.id)

  if (!ownerAgent) {
    return NextResponse.json({ success: false, error: 'Owner agent profile not found' }, { status: 403 })
  }

  const state = createLinkStateToken()
  const expiresAt = new Date(Date.now() + LINK_STATE_TTL_MINUTES * 60_000).toISOString()

  const { error } = await serviceClient
    .from('mcp_oauth_link_states')
    .insert({
      state,
      provider: config.provider,
      owner_human_id: ownerAgent.humanId,
      agent_id: ownerAgent.agentId,
      scopes_requested: config.requestedScopes,
      expires_at: expiresAt,
      metadata: {
        initiated_by_user_id: user.id,
      },
    })

  if (error) {
    log.error('Failed to create OAuth link state', { userId: user.id, agentId: ownerAgent.agentId }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: 'Failed to start OAuth link flow' }, { status: 500 })
  }

  const authorizeUrl = buildAuthorizeUrl(config, state)

  return NextResponse.json({
    success: true,
    data: {
      authorize_url: authorizeUrl,
      expires_at: expiresAt,
      provider: config.provider,
    },
  })
}
