import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from './supabase/server'
import crypto from 'crypto'
import { logger } from '@/lib/logger'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'
import { authenticateOAuthAgent } from '@/lib/mcp/oauth-auth'

// Terminology: this file uses legacy DB/API naming ("agent") for compatibility.
// In domain terms, these API keys authenticate a ResearchAgent (hirer/payer).
export interface AgentAuth {
  apiKeyId: string
  agentId: string
  keyPrefix: string
  scopes: string[]
  rateLimitPerMinute?: number
}

/**
 * Result of requireAgentWithScope - either authenticated agent or error response
 */
export type AgentAuthResult =
  | { ok: true; agent: AgentAuth; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }

export async function hashApiKey(key: string): Promise<string> {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export function getKeyPrefix(key: string): string {
  return key.slice(0, 16)
}

export async function authenticateAgent(request: Request): Promise<AgentAuth | null> {
  // "Agent" == ResearchAgent in domain terminology (`docs/domain-terminology.md`).
  const isValidApiKey = (key: string) =>
    key.startsWith('analoglabor_') || key.startsWith('al_live_')

  // Check X-API-Key header first, then Authorization header
  let apiKey = request.headers.get('X-API-Key')

  if (!apiKey) {
    const authHeader = request.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer analoglabor_')) {
      apiKey = authHeader.slice(7) // Remove 'Bearer '
    } else if (authHeader?.startsWith('Bearer al_live_')) {
      apiKey = authHeader.slice(7) // Remove 'Bearer '
    }
  }

  if (!apiKey) {
    return authenticateOAuthAgent(request)
  }

  if (!isValidApiKey(apiKey)) {
    return null
  }
  const keyHash = await hashApiKey(apiKey)
  const keyPrefix = getKeyPrefix(apiKey)

  const supabase = await createServiceClient()
  const log = logger.withContext('lib/api-auth.ts', 'authenticateAgent')

  const { data: keyRecord, error: keyError } = await supabase
    .from('api_keys')
    .select('id, agent_id, scopes, is_active, expires_at, rate_limit_per_minute, request_count')
    .eq('key_hash', keyHash)
    .eq('key_prefix', keyPrefix)
    .single()

  if (keyError) {
    // PGRST116 = not found, which is expected for invalid keys
    if (keyError.code !== 'PGRST116') {
      log.error('Failed to lookup API key', { keyPrefix }, { message: keyError.message, code: keyError.code })
    }
    return null
  }

  if (!keyRecord || !keyRecord.is_active) {
    return null
  }

  // Check expiration
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return null
  }

  // request_count is a monotonically increasing usage counter used for auditing.
  // Per-route rate limiting is enforced at the handler layer via `lib/rate-limit`.
  const currentCount = Number(keyRecord.request_count || 0)

  // Update last used timestamp and increment request count
  // Note: This increment is not atomic under concurrent requests, but rate limiting
  // is best-effort. For strict rate limiting, use Redis or similar.
  const { error: updateError } = await supabase
    .from('api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      request_count: currentCount + 1,
    })
    .eq('id', keyRecord.id)

  if (updateError) {
    // Log but don't fail auth - the key is valid, just tracking failed
    log.warn('Failed to update API key usage', { keyPrefix, error: updateError.message })
  }

  return {
    apiKeyId: keyRecord.id,
    agentId: keyRecord.agent_id,
    keyPrefix,
    scopes: keyRecord.scopes,
    rateLimitPerMinute: keyRecord.rate_limit_per_minute,
  }
}

export function hasAgentScope(agent: { scopes?: string[] } | null, scope: string): boolean {
  return Boolean(agent?.scopes?.includes(scope))
}

/**
 * Require authenticated agent with specific scope.
 * Combines API key auth + scope check + service client creation.
 * Returns the authenticated agent and a service-level Supabase client.
 */
export async function requireAgentWithScope(
  request: Request,
  scope: 'read' | 'write'
): Promise<AgentAuthResult> {
  const agent = await authenticateAgent(request)

  if (!agent) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
  if (rateLimitResponse) {
    return { ok: false, response: rateLimitResponse }
  }

  if (!hasAgentScope(agent, scope)) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 }),
    }
  }

  const supabase = await createServiceClient()

  return { ok: true, agent, supabase }
}

export async function generateApiKey(agentId: string, name: string = 'Default'): Promise<string> {
  const log = logger.withContext('lib/api-auth.ts', 'generateApiKey')
  const key = `analoglabor_${crypto.randomBytes(32).toString('hex')}`
  const keyHash = await hashApiKey(key)
  const keyPrefix = getKeyPrefix(key)

  const supabase = await createServiceClient()

  const { error } = await supabase.from('api_keys').insert({
    agent_id: agentId,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    name,
  })

  if (error) {
    log.error('Failed to insert API key', { agentId, keyPrefix }, { message: error.message, code: error.code })
    throw new Error(`Failed to create API key: ${error.message}`)
  }

  return key
}
