import crypto from 'crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'

import type { AgentAuth } from '@/lib/api-auth'
import { logger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/server'

const API_KEY_PREFIXES = ['analoglabor_', 'al_live_']
const DEFAULT_PROVIDER = 'auth0'
const DEFAULT_READ_SCOPE = 'analoglabor.read'
const DEFAULT_WRITE_SCOPE = 'analoglabor.write'

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export interface McpOAuthConfig {
  provider: string
  issuer: string
  audience: string | null
  resource: string
  readScope: string
  writeScope: string
  authorizationServers: string[]
}

export interface VerifiedMcpOAuthToken {
  issuer: string
  subject: string
  scopes: string[]
  token: string
}

function normalizeUrl(value: string): string {
  return value.replace(/\/$/, '')
}

function parseUrl(value: string | null | undefined): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function parseEnabledFlag(raw: string | undefined): boolean {
  if (!raw) return false
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

function resolveOriginHint(originHint?: string): string | null {
  const fromHint = (originHint || '').trim()
  if (fromHint) return normalizeUrl(fromHint)

  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim()
  if (fromEnv) return normalizeUrl(fromEnv)

  return null
}

export function getMcpOAuthConfig(originHint?: string): McpOAuthConfig | null {
  if (!parseEnabledFlag(process.env.MCP_OAUTH_ENABLED)) {
    return null
  }

  const issuerRaw = (process.env.MCP_OAUTH_ISSUER || '').trim()
  if (!issuerRaw) {
    return null
  }

  const issuer = normalizeUrl(issuerRaw)
  const origin = resolveOriginHint(originHint)
  const resourceRaw = (process.env.MCP_OAUTH_RESOURCE || '').trim()
  const resource = resourceRaw
    ? normalizeUrl(resourceRaw)
    : (origin ? `${origin}/api/v1/mcp` : '')

  if (!resource) {
    return null
  }

  const audience = (process.env.MCP_OAUTH_AUDIENCE || '').trim() || null

  return {
    provider: (process.env.MCP_OAUTH_PROVIDER || DEFAULT_PROVIDER).trim() || DEFAULT_PROVIDER,
    issuer,
    audience,
    resource,
    readScope: (process.env.MCP_OAUTH_SCOPES_READ || DEFAULT_READ_SCOPE).trim() || DEFAULT_READ_SCOPE,
    writeScope: (process.env.MCP_OAUTH_SCOPES_WRITE || DEFAULT_WRITE_SCOPE).trim() || DEFAULT_WRITE_SCOPE,
    authorizationServers: [issuer],
  }
}

function getJwksForIssuer(issuer: string) {
  const cached = jwksCache.get(issuer)
  if (cached) return cached

  const baseIssuer = issuer.replace(/\/+$/, '')
  const jwksUri = new URL(`${baseIssuer}/.well-known/jwks.json`)
  const remote = createRemoteJWKSet(jwksUri)
  jwksCache.set(issuer, remote)
  return remote
}

function parseScopes(scopeValue: unknown): string[] {
  const scopes = new Set<string>()

  if (typeof scopeValue === 'string') {
    for (const scope of scopeValue.split(' ')) {
      const normalized = scope.trim()
      if (normalized) scopes.add(normalized)
    }
  }

  if (Array.isArray(scopeValue)) {
    for (const scope of scopeValue) {
      if (typeof scope === 'string' && scope.trim()) {
        scopes.add(scope.trim())
      }
    }
  }

  return Array.from(scopes)
}

function syntheticApiKeyId(issuer: string, subject: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${issuer}:${subject}`)
    .digest('hex')
    .slice(0, 24)

  return `oauth_${digest}`
}

export function mapOAuthScopesToAgentScopes(oauthScopes: string[], config: McpOAuthConfig): string[] {
  const hasRead = oauthScopes.includes(config.readScope)
  const hasWrite = oauthScopes.includes(config.writeScope)

  if (!hasRead && !hasWrite) {
    return []
  }

  if (hasWrite) {
    return ['read', 'write']
  }

  return ['read']
}

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    return null
  }

  return token
}

function tokenLooksLikeApiKey(token: string): boolean {
  return API_KEY_PREFIXES.some((prefix) => token.startsWith(prefix))
}

export async function verifyMcpOAuthToken(
  token: string,
  options?: { originHint?: string; expectedAudience?: string }
): Promise<VerifiedMcpOAuthToken | null> {
  const config = getMcpOAuthConfig(options?.originHint)
  if (!config) {
    return null
  }

  if (tokenLooksLikeApiKey(token)) {
    return null
  }

  const audience = options?.expectedAudience || config.audience
  if (!audience) {
    return null
  }

  const log = logger.withContext('lib/mcp/oauth-auth.ts', 'verifyMcpOAuthToken')

  try {
    const issuerCandidates = config.issuer.endsWith('/')
      ? [config.issuer, config.issuer.slice(0, -1)]
      : [config.issuer, `${config.issuer}/`]
    const { payload } = await jwtVerify(token, getJwksForIssuer(config.issuer), {
      issuer: issuerCandidates,
      audience,
    })

    const subject = typeof payload.sub === 'string' ? payload.sub.trim() : ''
    if (!subject) {
      return null
    }

    const issuer = typeof payload.iss === 'string' ? payload.iss : config.issuer
    const scopes = parseScopes(payload.scope ?? payload.scp)

    return {
      issuer,
      subject,
      scopes,
      token,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn('Failed to verify OAuth token', { message })
    return null
  }
}

export async function authenticateOAuthAgent(request: Request): Promise<AgentAuth | null> {
  const token = extractBearerToken(request)
  if (!token) {
    return null
  }

  const config = getMcpOAuthConfig()
  if (!config || !config.audience) {
    return null
  }

  const verified = await verifyMcpOAuthToken(token)
  if (!verified) {
    return null
  }

  const agentScopes = mapOAuthScopesToAgentScopes(verified.scopes, config)
  if (agentScopes.length === 0) {
    return null
  }

  const supabase = await createServiceClient()
  const log = logger.withContext('lib/mcp/oauth-auth.ts', 'authenticateOAuthAgent')

  const { data: identity, error } = await supabase
    .from('mcp_oauth_identities')
    .select('id, agent_id, revoked_at')
    .eq('provider', config.provider)
    .eq('issuer', verified.issuer)
    .eq('subject', verified.subject)
    .is('revoked_at', null)
    .maybeSingle()

  if (error) {
    if (error.code !== 'PGRST116') {
      log.error('Failed to lookup OAuth identity', { issuer: verified.issuer }, { message: error.message, code: error.code })
    }
    return null
  }

  if (!identity || identity.revoked_at) {
    return null
  }

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('mcp_oauth_identities')
    .update({
      last_used_at: now,
      scopes_granted: verified.scopes,
    })
    .eq('id', identity.id)

  if (updateError) {
    log.warn('Failed to update OAuth identity usage', { identityId: identity.id, error: updateError.message })
  }

  return {
    apiKeyId: syntheticApiKeyId(verified.issuer, verified.subject),
    agentId: identity.agent_id,
    keyPrefix: 'oauth',
    scopes: agentScopes,
  }
}

export function getMcpOauthChallengeHeader(params: {
  originHint: string
  requiredScope?: string
  error?: string
  errorDescription?: string
}): string | null {
  const config = getMcpOAuthConfig(params.originHint)
  if (!config) {
    return null
  }

  const resourceUrl = parseUrl(config.resource)
  const originHint = resolveOriginHint(params.originHint) || normalizeUrl(params.originHint)
  const metadataOrigin = resourceUrl ? normalizeUrl(resourceUrl.origin) : originHint
  const metadataUrl = `${metadataOrigin}/.well-known/oauth-protected-resource`
  const parts = [`Bearer resource_metadata=\"${metadataUrl}\"`]

  const scope = params.requiredScope || config.readScope
  if (scope) {
    parts.push(`scope=\"${scope}\"`)
  }

  if (params.error) {
    parts.push(`error=\"${params.error}\"`)
  }

  if (params.errorDescription) {
    const escaped = params.errorDescription.replace(/\"/g, '\\"')
    parts.push(`error_description=\"${escaped}\"`)
  }

  return parts.join(', ')
}
