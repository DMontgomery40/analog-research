import crypto from 'crypto'

import { resolveCanonicalAppOrigin } from '@/lib/app-origin'
import { getMcpOAuthConfig, type McpOAuthConfig } from '@/lib/mcp/oauth-auth'

export interface McpOauthLinkConfig extends McpOAuthConfig {
  clientId: string
  clientSecret: string
  callbackUrl: string
  authorizeEndpoint: string
  tokenEndpoint: string
  requestedScopes: string[]
}

export interface OAuthTokenExchangeResult {
  accessToken: string
  idToken: string | null
  tokenType: string
  expiresIn: number | null
  scope: string[]
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

export function createLinkStateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function getMcpOauthLinkConfig(originHint: string): McpOauthLinkConfig | null {
  const baseConfig = getMcpOAuthConfig(originHint)
  if (!baseConfig) {
    return null
  }

  const clientId = (process.env.AUTH0_MCP_LINK_CLIENT_ID || '').trim()
  const clientSecret = (process.env.AUTH0_MCP_LINK_CLIENT_SECRET || '').trim()

  if (!clientId || !clientSecret) {
    return null
  }

  const canonicalOrigin = resolveCanonicalAppOrigin(originHint)
  const callbackUrl = `${canonicalOrigin}/api/v1/mcp/oauth/link/callback`

  const requestedScopes = unique([
    'openid',
    'profile',
    'email',
    baseConfig.readScope,
    baseConfig.writeScope,
  ])

  return {
    ...baseConfig,
    clientId,
    clientSecret,
    callbackUrl,
    authorizeEndpoint: `${baseConfig.issuer}/authorize`,
    tokenEndpoint: `${baseConfig.issuer}/oauth/token`,
    requestedScopes,
  }
}

export function buildAuthorizeUrl(config: McpOauthLinkConfig, state: string): string {
  const url = new URL(config.authorizeEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.callbackUrl)
  url.searchParams.set('scope', config.requestedScopes.join(' '))
  url.searchParams.set('state', state)

  if (config.audience) {
    url.searchParams.set('audience', config.audience)
  }

  return url.toString()
}

function parseScopeValue(raw: unknown): string[] {
  if (typeof raw !== 'string') {
    return []
  }

  return raw
    .split(' ')
    .map((scope) => scope.trim())
    .filter(Boolean)
}

export async function exchangeCodeForTokens(
  config: McpOauthLinkConfig,
  code: string
): Promise<OAuthTokenExchangeResult> {
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('client_id', config.clientId)
  body.set('client_secret', config.clientSecret)
  body.set('code', code)
  body.set('redirect_uri', config.callbackUrl)

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null

  if (!response.ok || !payload) {
    const description = typeof payload?.error_description === 'string'
      ? payload.error_description
      : `token endpoint returned ${response.status}`
    throw new Error(description)
  }

  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : ''
  if (!accessToken) {
    throw new Error('OAuth token response missing access_token')
  }

  return {
    accessToken,
    idToken: typeof payload.id_token === 'string' ? payload.id_token : null,
    tokenType: typeof payload.token_type === 'string' ? payload.token_type : 'Bearer',
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : null,
    scope: parseScopeValue(payload.scope),
  }
}
