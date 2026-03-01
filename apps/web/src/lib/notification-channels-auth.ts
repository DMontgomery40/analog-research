/**
 * Shared auth and validation utilities for notification-channels API endpoints
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authenticateAgent } from '@/lib/api-auth'
import { resolveSessionOwnerAgent } from '@/lib/session-owner-agent'
import { logger } from '@/lib/logger'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'
import { validateDiscordWebhookUrl, validateOutboundWebhookUrl, validateSlackWebhookUrl } from '@/lib/webhook-url'

// Channel config schemas
export const webhookConfigSchema = z.object({
  url: z.string().min(1).max(2048),
  secret: z.string().optional(),
})

export const emailConfigSchema = z.object({
  address: z.string().email(),
})

export const slackConfigSchema = z.object({
  webhook_url: z.string().min(1).max(2048),
})

export const discordConfigSchema = z.object({
  webhook_url: z.string().min(1).max(2048),
})

export type EntityType = 'human' | 'agent'

export interface ChannelAuthResult {
  ok: true
  entityType: EntityType
  entityId: string
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>
}

export interface ChannelAuthError {
  ok: false
  response: NextResponse
}

/**
 * Authenticate request and determine entity type/id for notification channels.
 * Supports: session auth (human or human-as-agent), API key auth (agent)
 */
export async function authenticateChannelRequest(
  request: NextRequest,
  log: ReturnType<typeof logger.withContext>
): Promise<ChannelAuthResult | ChannelAuthError> {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  const agent = await authenticateAgent(request)
  const asAgent = request.nextUrl.searchParams.get('as') === 'agent'

  // API key auth for agents
  if (agent) {
    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) {
      return { ok: false, response: rateLimitResponse }
    }

    return { ok: true, entityType: 'agent', entityId: agent.agentId, serviceClient }
  }

  // Session auth required
  if (!user) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  // Human as agent (managing their ResearchAgent's channels)
  if (asAgent) {
    const ownerAgent = await resolveSessionOwnerAgent(serviceClient, user.id)
    if (!ownerAgent) {
      log.warn('User has no owner agent', { userId: user.id })
      return { ok: false, response: NextResponse.json({ success: false, error: 'No agent found for user' }, { status: 404 }) }
    }
    return { ok: true, entityType: 'agent', entityId: ownerAgent.agentId, serviceClient }
  }

  // Human managing their own channels
  const { data: human, error: humanError } = await supabase
    .from('humans')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (humanError || !human) {
    log.warn('User has no human profile', { userId: user.id })
    return { ok: false, response: NextResponse.json({ success: false, error: 'Human profile not found' }, { status: 404 }) }
  }

  return { ok: true, entityType: 'human', entityId: human.id, serviceClient }
}

/**
 * Validate channel config based on channel type
 */
export async function validateChannelConfig(
  channelType: string,
  config: Record<string, unknown>
): Promise<{ ok: true; config: Record<string, unknown> } | { ok: false; error: string }> {
  switch (channelType) {
    case 'webhook': {
      const schemaResult = webhookConfigSchema.safeParse(config)
      if (!schemaResult.success) {
        return { ok: false, error: schemaResult.error.errors.map((e) => e.message).join(', ') }
      }
      const result = await validateOutboundWebhookUrl(schemaResult.data.url)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, config: { ...schemaResult.data, url: result.url.toString() } }
    }
    case 'email': {
      const schemaResult = emailConfigSchema.safeParse(config)
      if (!schemaResult.success) {
        return { ok: false, error: schemaResult.error.errors.map((e) => e.message).join(', ') }
      }
      return { ok: true, config: schemaResult.data }
    }
    case 'slack': {
      const schemaResult = slackConfigSchema.safeParse(config)
      if (!schemaResult.success) {
        return { ok: false, error: schemaResult.error.errors.map((e) => e.message).join(', ') }
      }
      const result = await validateSlackWebhookUrl(schemaResult.data.webhook_url)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, config: { ...schemaResult.data, webhook_url: result.url.toString() } }
    }
    case 'discord': {
      const schemaResult = discordConfigSchema.safeParse(config)
      if (!schemaResult.success) {
        return { ok: false, error: schemaResult.error.errors.map((e) => e.message).join(', ') }
      }
      const result = await validateDiscordWebhookUrl(schemaResult.data.webhook_url)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, config: { ...schemaResult.data, webhook_url: result.url.toString() } }
    }
    default:
      return { ok: false, error: `Unknown channel type: ${channelType}` }
  }
}
