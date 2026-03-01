import { NextRequest, NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { getMcpOauthLinkConfig } from '@/lib/mcp/oauth-link'
import { resolveSessionOwnerAgent } from '@/lib/session-owner-agent'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function requireSessionContext(request: NextRequest) {
  const config = getMcpOauthLinkConfig(request.nextUrl.origin)
  if (!config) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: 'MCP OAuth linking is not configured' }, { status: 503 }) }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const serviceClient = await createServiceClient()
  const ownerAgent = await resolveSessionOwnerAgent(serviceClient, user.id)

  if (!ownerAgent) {
    return {
      ok: true as const,
      config,
      user,
      serviceClient,
      ownerAgent: null,
    }
  }

  return {
    ok: true as const,
    config,
    user,
    serviceClient,
    ownerAgent,
  }
}

export async function GET(request: NextRequest) {
  const context = await requireSessionContext(request)
  if (!context.ok) {
    return context.response
  }

  if (!context.ownerAgent) {
    return NextResponse.json({
      success: true,
      data: {
        linked: false,
        provider: context.config.provider,
      },
    })
  }

  const { data: identity, error } = await context.serviceClient
    .from('mcp_oauth_identities')
    .select('provider, issuer, subject, scopes_granted, created_at, updated_at, last_used_at, revoked_at')
    .eq('agent_id', context.ownerAgent.agentId)
    .eq('provider', context.config.provider)
    .is('revoked_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    const log = logger.withContext('api/v1/mcp/oauth/link/route.ts', 'GET')
    log.error('Failed to fetch OAuth link status', { agentId: context.ownerAgent.agentId }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: 'Failed to load OAuth link status' }, { status: 500 })
  }

  if (!identity) {
    return NextResponse.json({
      success: true,
      data: {
        linked: false,
        provider: context.config.provider,
      },
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      linked: true,
      provider: identity.provider,
      issuer: identity.issuer,
      subject: identity.subject,
      scopes_granted: identity.scopes_granted,
      created_at: identity.created_at,
      updated_at: identity.updated_at,
      last_used_at: identity.last_used_at,
    },
  })
}

export async function DELETE(request: NextRequest) {
  const context = await requireSessionContext(request)
  if (!context.ok) {
    return context.response
  }

  if (!context.ownerAgent) {
    return NextResponse.json({
      success: true,
      data: {
        revoked: 0,
      },
    })
  }

  const now = new Date().toISOString()
  const { data, error } = await context.serviceClient
    .from('mcp_oauth_identities')
    .update({ revoked_at: now })
    .eq('agent_id', context.ownerAgent.agentId)
    .eq('provider', context.config.provider)
    .is('revoked_at', null)
    .select('id')

  if (error) {
    const log = logger.withContext('api/v1/mcp/oauth/link/route.ts', 'DELETE')
    log.error('Failed to revoke OAuth links', { agentId: context.ownerAgent.agentId }, { message: error.message, code: error.code })
    return NextResponse.json({ success: false, error: 'Failed to revoke OAuth link' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      revoked: data?.length || 0,
    },
  })
}
