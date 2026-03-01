import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hashApiKey, getKeyPrefix } from '@/lib/api-auth'
import { logger } from '@/lib/logger'
import { handleMutationResult } from '@/lib/supabase/errors'
import crypto from 'crypto'
import { z } from 'zod'
import { resolveOrCreateSessionOwnerAgent, resolveSessionOwnerAgent } from '@/lib/session-owner-agent'

export const runtime = 'nodejs'

const createKeySchema = z.object({
  name: z.string().min(1).max(100).optional().default('Default'),
})

// GET /api/v1/keys - List all API keys for the authenticated user
export async function GET(_request: NextRequest) {
  const log = logger.withContext('api/v1/keys/route.ts', 'GET')

  try {
    // Try human auth first (session-based)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const serviceClient = await createServiceClient()

    const ownerAgent = await resolveSessionOwnerAgent(serviceClient, user.id)
    if (!ownerAgent) {
      return NextResponse.json({
        success: true,
        data: []
      })
    }

    // Get all active keys for this agent
    const { data: keys, error } = await serviceClient
      .from('api_keys')
      .select('id, name, key_prefix, created_at, last_used_at, request_count')
      .eq('agent_id', ownerAgent.agentId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      log.error('Failed to fetch API keys', { agentId: ownerAgent.agentId }, error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch API keys' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: keys || []
    })
  } catch (error) {
    log.error('Unexpected error', {}, error instanceof Error ? error : { message: String(error) })
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/v1/keys - Generate a new API key
export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/keys/route.ts', 'POST')

  try {
    // Try human auth (session-based)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const parsed = createKeySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
    }
    const keyName = parsed.data.name

    const serviceClient = await createServiceClient()

    const ownerAgent = await resolveOrCreateSessionOwnerAgent(serviceClient, user.id)
    if (!ownerAgent) {
      log.error('Failed to resolve owner agent for API key creation', { userId: user.id })
      return NextResponse.json(
        { success: false, error: 'Failed to create agent account' },
        { status: 500 }
      )
    }

    // Generate the API key with al_live_ prefix (production format)
    const rawKey = `al_live_${crypto.randomBytes(32).toString('hex')}`
    const keyHash = await hashApiKey(rawKey)
    const keyPrefix = getKeyPrefix(rawKey)

    // Insert the key
    const { data: newKey, error: keyError } = await serviceClient
      .from('api_keys')
      .insert({
        agent_id: ownerAgent.agentId,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        name: keyName,
        scopes: ['read', 'write'],
        is_active: true
      })
      .select('id, name, key_prefix, created_at')
      .single()

    const keyResult = handleMutationResult(newKey, keyError, log, 'Create API key', { agentId: ownerAgent.agentId })
    if (keyResult.response) return keyResult.response

    log.info('API key created', { keyPrefix, agentId: ownerAgent.agentId })

    // Return the raw key ONCE - it will never be shown again
    return NextResponse.json({
      success: true,
      data: {
        id: keyResult.data.id,
        name: keyResult.data.name,
        key_prefix: keyResult.data.key_prefix,
        key: rawKey, // Only returned on creation
        created_at: keyResult.data.created_at
      }
    })
  } catch (error) {
    log.error('Unexpected error', {}, error instanceof Error ? error : { message: String(error) })
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
