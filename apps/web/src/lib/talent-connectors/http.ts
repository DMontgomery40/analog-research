import { NextRequest, NextResponse } from 'next/server'
import { z, type ZodType } from 'zod'

import { requireOwnerAgentAccess } from '@/lib/owner-agent-auth'
import type { OwnerAgentAccess, OwnerAgentAuthContext } from '@/lib/owner-agent-auth'
import {
  ensureTalentConnectorsSchema,
  ensureExternalIntegrationsSchema,
  toSchemaParityErrorBody,
} from '@/lib/schema-parity'
import { executeTalentAction } from '@/lib/talent-connectors/service'
import { TALENT_ERROR_CODES } from '@/lib/talent-connectors/types'
import { isTalentProvider } from '@/lib/talent-connectors/types'
import type { TalentProvider } from '@/lib/talent-connectors/types'

export interface TalentRouteContext {
  actingAgentId: string
  serviceClient: OwnerAgentAuthContext['serviceClient']
}

export interface TalentProviderRouteContext extends TalentRouteContext {
  provider: TalentProvider
}

/**
 * Shared guard for all talent-connector routes:
 *  1. Auth (owner-or-agent with scope)
 *  2. Global kill switch
 *  3. Schema parity (talent_connectors tables)
 */
export async function requireTalentConnectorAccess(
  request: NextRequest,
  access: OwnerAgentAccess,
): Promise<{ ok: true; context: TalentRouteContext } | { ok: false; response: NextResponse }> {
  const auth = await requireOwnerAgentAccess(request, access, { createIfMissing: true })
  if (!auth.ok) return auth

  // Global kill switch
  if (process.env.TALENT_CONNECTORS_ENABLED !== 'true') {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Talent connectors are disabled', code: TALENT_ERROR_CODES.TALENT_CONNECTORS_DISABLED },
        { status: 403 },
      ),
    }
  }

  // Schema parity
  const schema = await ensureTalentConnectorsSchema({ supabase: auth.context.serviceClient })
  if (!schema.ok) {
    return { ok: false, response: NextResponse.json(toSchemaParityErrorBody(schema), { status: 503 }) }
  }

  return {
    ok: true,
    context: {
      actingAgentId: auth.context.actingAgentId,
      serviceClient: auth.context.serviceClient,
    },
  }
}

/**
 * Extended guard that also validates a [provider] param and checks external_integrations schema.
 */
export async function requireTalentProviderAccess(
  request: NextRequest,
  params: Promise<{ provider: string }>,
  access: OwnerAgentAccess,
): Promise<{ ok: true; context: TalentProviderRouteContext } | { ok: false; response: NextResponse }> {
  const result = await requireTalentConnectorAccess(request, access)
  if (!result.ok) return result

  const { provider: rawProvider } = await params
  if (!isTalentProvider(rawProvider)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: `Unknown talent provider: ${rawProvider}`, code: TALENT_ERROR_CODES.TALENT_PROVIDER_UNKNOWN },
        { status: 400 },
      ),
    }
  }

  // Credential routes also need external_integrations schema
  const eiSchema = await ensureExternalIntegrationsSchema({ supabase: result.context.serviceClient })
  if (!eiSchema.ok) {
    return { ok: false, response: NextResponse.json(toSchemaParityErrorBody(eiSchema), { status: 503 }) }
  }

  return {
    ok: true,
    context: { ...result.context, provider: rawProvider },
  }
}

// ---------------------------------------------------------------------------
// Shared schemas & body parsing
// ---------------------------------------------------------------------------

/** Base fields shared by all talent-connector action routes. */
export const talentActionBaseSchema = z.object({
  provider: z.string(),
  env: z.enum(['live', 'sandbox']).default('live'),
  idempotency_key: z.string().min(1).max(255),
  match_id: z.string().uuid().optional(),
  worker_id: z.string().uuid().optional(),
})

/** Parse a request body with a Zod schema and validate the provider field. */
export function parseTalentBody<T extends { provider: string }>(
  raw: unknown,
  schema: ZodType<T, any, any>,
): { ok: true; body: T } | { ok: false; response: NextResponse } {
  let body: T
  try {
    body = schema.parse(raw)
  } catch {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 }) }
  }
  if (!isTalentProvider(body.provider)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: `Unknown talent provider: ${body.provider}`, code: TALENT_ERROR_CODES.TALENT_PROVIDER_UNKNOWN },
        { status: 400 },
      ),
    }
  }
  return { ok: true, body }
}

// ---------------------------------------------------------------------------
// Shared action handler (contact / post_task / sync)
// ---------------------------------------------------------------------------

interface ActionRouteConfig<T extends { provider: string; env: string; idempotency_key: string; match_id?: string; worker_id?: string }> {
  schema: ZodType<T, any, any>
  actionType: 'contact' | 'post_task' | 'sync'
  /** Map parsed body to action-specific requestPayload fields */
  toPayload: (body: T) => Record<string, unknown>
  /** HTTP status on success (default 201) */
  successStatus?: number
}

export async function handleTalentActionRoute<T extends { provider: string; env: string; idempotency_key: string; match_id?: string; worker_id?: string }>(
  request: NextRequest,
  config: ActionRouteConfig<T>,
): Promise<NextResponse> {
  const guard = await requireTalentConnectorAccess(request, 'write')
  if (!guard.ok) return guard.response
  const { actingAgentId, serviceClient } = guard.context

  const eiSchema = await ensureExternalIntegrationsSchema({ supabase: serviceClient })
  if (!eiSchema.ok) return NextResponse.json(toSchemaParityErrorBody(eiSchema), { status: 503 })

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseTalentBody(rawBody, config.schema)
  if (!parsed.ok) return parsed.response
  const body = parsed.body

  const result = await executeTalentAction(serviceClient, actingAgentId, {
    provider: body.provider as TalentProvider,
    env: body.env as 'live' | 'sandbox',
    actionType: config.actionType,
    idempotencyKey: body.idempotency_key,
    matchId: body.match_id,
    workerId: body.worker_id,
    requestPayload: config.toPayload(body),
  })

  if (!result.ok) {
    if ('response' in result && result.response) {
      return result.response
    }

    const status = result.code === TALENT_ERROR_CODES.TALENT_IDEMPOTENCY_CONFLICT ? 409 : 422
    return NextResponse.json(
      { success: false, error: result.error, ...(result.code && { code: result.code }) },
      { status },
    )
  }

  return NextResponse.json({ success: true, data: result.data }, { status: config.successStatus ?? 201 })
}
