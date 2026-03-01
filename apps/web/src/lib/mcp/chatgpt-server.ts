import { NextRequest } from 'next/server'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { authenticateAgent, type AgentAuth } from '@/lib/api-auth'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'
import { dispatchMcpToolCall } from '@/lib/mcp/dispatcher'
import {
  getMcpOAuthConfig,
  getMcpOauthChallengeHeader,
} from '@/lib/mcp/oauth-auth'
import {
  listChatGptResources,
  readChatGptResource,
} from '@/lib/mcp/chatgpt-resources'
import {
  getToolDefinition,
  isToolAllowedForAgent,
  listCanonicalTools,
} from '@/lib/mcp/tools'

const SERVER_INFO = {
  name: 'analoglabor-mcp-chatgpt',
  version: '1.0.0',
}

const CHATGPT_ADMIN_API_KEY_ENV = 'MCP_CHATGPT_ADMIN_API_KEY'

const DEFAULT_READ_SCOPE = 'analoglabor.read'
const DEFAULT_WRITE_SCOPE = 'analoglabor.write'

export interface ChatGptMcpRequestContext {
  agent: AgentAuth | null
  authToken: string | null
  baseUrl: string
  requestOrigin: string
}

type CallToolResponse = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent: {
    tool: string
    status: 'ok' | 'error'
    data: unknown
    error: string | null
  }
  isError?: true
  _meta?: Record<string, unknown>
}

const normalizeUrl = (baseUrl: string) => baseUrl.replace(/\/$/, '')

function resolveChatGptAdminFallbackApiKey(): string | null {
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  const explicit = (process.env[CHATGPT_ADMIN_API_KEY_ENV] || '').trim()
  if (explicit) {
    return explicit
  }

  const generic = (process.env.ANALOGLABOR_API_KEY || '').trim()
  if (generic) {
    return generic
  }

  return null
}

function cloneRequestWithApiKey(request: NextRequest, apiKey: string): Request {
  const headers = new Headers(request.headers)
  headers.set('X-API-Key', apiKey)

  return new Request(request.url, {
    method: request.method,
    headers,
  })
}

function resolveApiBaseUrl(request: NextRequest): string {
  const envBase = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim()
  const origin = envBase || request.nextUrl.origin
  return `${normalizeUrl(origin)}/api/v1`
}

export function extractAuthToken(request: NextRequest): string | null {
  const apiKeyHeader = request.headers.get('X-API-Key')
  if (apiKeyHeader) {
    const value = apiKeyHeader.trim()
    if (value) return value
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7).trim()
  return token || null
}

function requiredToolScope(toolName: string, originHint: string): string {
  const config = getMcpOAuthConfig(originHint)
  const definition = getToolDefinition(toolName)
  if (!definition) {
    return config?.readScope || DEFAULT_READ_SCOPE
  }

  if (definition.access === 'write') {
    return config?.writeScope || DEFAULT_WRITE_SCOPE
  }

  return config?.readScope || DEFAULT_READ_SCOPE
}

function oauthChallengeMeta(params: {
  originHint: string
  requiredScope: string
  error: string
  errorDescription: string
}): Record<string, unknown> | undefined {
  const challenge = getMcpOauthChallengeHeader(params)
  if (!challenge) {
    return undefined
  }

  return {
    'mcp/www_authenticate': [challenge],
  }
}

function toSuccessResponse(tool: string, data: unknown): CallToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: {
      tool,
      status: 'ok',
      data,
      error: null,
    },
  }
}

function toErrorResponse(
  tool: string,
  error: string,
  meta?: Record<string, unknown>
): CallToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: `Error: ${error}`,
      },
    ],
    structuredContent: {
      tool,
      status: 'error',
      data: null,
      error,
    },
    isError: true,
    ...(meta ? { _meta: meta } : {}),
  }
}

export async function executeChatGptToolCall(params: {
  name: string
  args: Record<string, unknown> | undefined
  context: ChatGptMcpRequestContext
  dispatch?: typeof dispatchMcpToolCall
}): Promise<CallToolResponse> {
  const definition = getToolDefinition(params.name)
  if (!definition) {
    return toErrorResponse(params.name, `Unknown tool: ${params.name}`)
  }

  const requiredScope = requiredToolScope(params.name, params.context.requestOrigin)

  if (!params.context.agent || !params.context.authToken) {
    const description = params.context.authToken
      ? 'OAuth token rejected, please re-authenticate'
      : 'Authenticate to run this tool'

    return toErrorResponse(
      params.name,
      'Authentication required',
      oauthChallengeMeta({
        originHint: params.context.requestOrigin,
        requiredScope,
        error: 'invalid_token',
        errorDescription: description,
      })
    )
  }

  if (!isToolAllowedForAgent(params.context.agent, definition)) {
    return toErrorResponse(
      params.name,
      'Insufficient permissions',
      oauthChallengeMeta({
        originHint: params.context.requestOrigin,
        requiredScope,
        error: 'insufficient_scope',
        errorDescription: 'OAuth scope upgrade required for this tool',
      })
    )
  }

  const dispatchFn = params.dispatch || dispatchMcpToolCall
  const result = await dispatchFn(params.name, params.args, {
    agent: params.context.agent,
    apiKey: params.context.authToken,
    baseUrl: params.context.baseUrl,
  })

  if (!result.ok) {
    if (result.error === 'Insufficient permissions') {
      return toErrorResponse(
        params.name,
        result.error,
        oauthChallengeMeta({
          originHint: params.context.requestOrigin,
          requiredScope,
          error: 'insufficient_scope',
          errorDescription: 'OAuth scope upgrade required for this tool',
        })
      )
    }

    return toErrorResponse(params.name, result.error)
  }

  return toSuccessResponse(params.name, result.result)
}

function createChatGptServer(context: ChatGptMcpRequestContext): Server {
  const server = new Server(
    SERVER_INFO,
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listCanonicalTools(),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return executeChatGptToolCall({
      name: request.params.name,
      args: request.params.arguments as Record<string, unknown> | undefined,
      context,
    })
  })

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listChatGptResources(),
  }))

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri
    const resource = readChatGptResource(uri)

    if (!resource) {
      throw new Error(`Unknown resource URI: ${uri}`)
    }

    return {
      contents: [resource],
    }
  })

  return server
}

export async function handleChatGptMcpRequest(request: NextRequest): Promise<Response> {
  const incomingAuthToken = extractAuthToken(request)
  const fallbackApiKey = incomingAuthToken ? null : resolveChatGptAdminFallbackApiKey()
  const authToken = incomingAuthToken || fallbackApiKey
  const authRequest = fallbackApiKey ? cloneRequestWithApiKey(request, fallbackApiKey) : request
  const agent = await authenticateAgent(authRequest)
  if (agent) {
    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) {
      return rateLimitResponse
    }
  }

  const server = createChatGptServer({
    agent,
    authToken,
    baseUrl: resolveApiBaseUrl(request),
    requestOrigin: request.nextUrl.origin,
  })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)
  return transport.handleRequest(request)
}
