import { NextRequest, NextResponse } from 'next/server'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { authenticateAgent, type AgentAuth } from '@/lib/api-auth'
import { dispatchMcpToolCall } from '@/lib/mcp/dispatcher'
import { getToolDefinition, listToolsForAgent } from '@/lib/mcp/tools'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'
import { getMcpOauthChallengeHeader } from '@/lib/mcp/oauth-auth'

export const runtime = 'nodejs'

const SERVER_INFO = {
  name: 'analoglabor-mcp',
  version: '1.0.0',
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, '')

function resolveApiBaseUrl(request: NextRequest) {
  const envBase = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim()
  if (envBase) {
    return `${normalizeBaseUrl(envBase)}/api/v1`
  }
  return `${normalizeBaseUrl(request.nextUrl.origin)}/api/v1`
}

function extractAgentToken(request: NextRequest): string | null {
  const apiKeyHeader = request.headers.get('X-API-Key')
  if (apiKeyHeader) {
    return apiKeyHeader.trim()
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  return authHeader.slice(7).trim() || null
}

function unauthorizedResponse(request: NextRequest, params?: {
  requiredScope?: string
  error?: string
  errorDescription?: string
}) {
  const response = NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const challenge = getMcpOauthChallengeHeader({
    originHint: request.nextUrl.origin,
    requiredScope: params?.requiredScope,
    error: params?.error,
    errorDescription: params?.errorDescription,
  })

  if (challenge) {
    response.headers.set('WWW-Authenticate', challenge)
  }

  return response
}

function createMcpServer(context: {
  agent: AgentAuth
  apiKey: string
  baseUrl: string
  requestOrigin: string
}) {
  const server = new Server(
    SERVER_INFO,
    {
      capabilities: {
        tools: {},
      },
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listToolsForAgent(context.agent),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const result = await dispatchMcpToolCall(
      name,
      args as Record<string, unknown> | undefined,
      {
        agent: context.agent,
        apiKey: context.apiKey,
        baseUrl: context.baseUrl,
      }
    )

    if (!result.ok) {
      const errorResult: {
        content: Array<{ type: 'text'; text: string }>
        isError: true
        _meta?: Record<string, unknown>
      } = {
        content: [
          {
            type: 'text',
            text: `Error: ${result.error}`,
          },
        ],
        isError: true,
      }

      if (result.error === 'Insufficient permissions') {
        const definition = getToolDefinition(name)
        const requiredScope = definition?.access === 'write'
          ? ((process.env.MCP_OAUTH_SCOPES_WRITE || 'analoglabor.write').trim() || 'analoglabor.write')
          : ((process.env.MCP_OAUTH_SCOPES_READ || 'analoglabor.read').trim() || 'analoglabor.read')

        const challenge = getMcpOauthChallengeHeader({
          originHint: context.requestOrigin,
          requiredScope,
          error: 'insufficient_scope',
          errorDescription: 'OAuth scope upgrade required for this tool',
        })

        if (challenge) {
          errorResult._meta = {
            'mcp/www_authenticate': [challenge],
          }
        }
      }

      return errorResult
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.result, null, 2),
        },
      ],
    }
  })

  return server
}

async function handleMcpRequest(request: NextRequest) {
  const agent = await authenticateAgent(request)

  if (!agent) {
    return unauthorizedResponse(request, {
      error: 'invalid_token',
      errorDescription: 'Authentication required for MCP access',
    })
  }

  const authToken = extractAgentToken(request)
  if (!authToken) {
    return unauthorizedResponse(request, {
      error: 'invalid_token',
      errorDescription: 'Bearer or X-API-Key token is required',
    })
  }

  const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
  if (rateLimitResponse) return rateLimitResponse

  const baseUrl = resolveApiBaseUrl(request)
  const server = createMcpServer({
    agent,
    apiKey: authToken,
    baseUrl,
    requestOrigin: request.nextUrl.origin,
  })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)

  return transport.handleRequest(request)
}

export async function POST(request: NextRequest) {
  return handleMcpRequest(request)
}

export async function GET(request: NextRequest) {
  return handleMcpRequest(request)
}

export async function DELETE(request: NextRequest) {
  return handleMcpRequest(request)
}
