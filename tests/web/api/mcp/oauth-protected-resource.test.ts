import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from '@/app/api/v1/mcp/oauth-protected-resource/route'

describe('GET /api/v1/mcp/oauth-protected-resource', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 404 when MCP OAuth is disabled', async () => {
    vi.stubEnv('MCP_OAUTH_ENABLED', 'false')

    const response = await GET(new NextRequest('https://api.analoglabor.com/api/v1/mcp/oauth-protected-resource'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json).toEqual({
      success: false,
      error: 'MCP OAuth is not configured',
    })
  })

  it('returns RFC9728 metadata when enabled', async () => {
    vi.stubEnv('MCP_OAUTH_ENABLED', 'true')
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://auth.example.com')
    vi.stubEnv('MCP_OAUTH_AUDIENCE', 'https://api.analoglabor.com')
    vi.stubEnv('MCP_OAUTH_RESOURCE', 'https://api.analoglabor.com/api/v1/mcp')
    vi.stubEnv('MCP_OAUTH_SCOPES_READ', 'analoglabor.read')
    vi.stubEnv('MCP_OAUTH_SCOPES_WRITE', 'analoglabor.write')

    const response = await GET(new NextRequest('https://api.analoglabor.com/api/v1/mcp/oauth-protected-resource'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      resource: 'https://api.analoglabor.com/api/v1/mcp',
      authorization_servers: ['https://auth.example.com'],
      scopes_supported: ['analoglabor.read', 'analoglabor.write'],
      resource_documentation: 'https://analoglabor.com/mcp',
    })
  })
})
