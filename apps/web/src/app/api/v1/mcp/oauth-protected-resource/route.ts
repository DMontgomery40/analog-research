import { NextRequest, NextResponse } from 'next/server'

import { resolveCanonicalAppOrigin } from '@/lib/app-origin'
import { getMcpOAuthConfig } from '@/lib/mcp/oauth-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const config = getMcpOAuthConfig(request.nextUrl.origin)
  if (!config) {
    return NextResponse.json({
      success: false,
      error: 'MCP OAuth is not configured',
    }, { status: 404 })
  }

  const documentation = `${resolveCanonicalAppOrigin(request.nextUrl.origin)}/mcp`

  return NextResponse.json({
    resource: config.resource,
    authorization_servers: config.authorizationServers,
    scopes_supported: [config.readScope, config.writeScope],
    resource_documentation: documentation,
  })
}
