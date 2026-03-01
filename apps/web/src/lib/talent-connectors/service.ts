import type { SupabaseClient } from '@supabase/supabase-js'

import { decryptIntegrationCredentials } from '@/lib/integrations-secrets'
import { logger } from '@/lib/logger'
import { createErrorResponse, handleQueryError, handleMutationResult } from '@/lib/supabase/errors'
import type { TalentProvider } from '@/lib/talent-connectors/types'
import { TALENT_ERROR_CODES } from '@/lib/talent-connectors/types'
import { evaluateTalentConnectorPolicy } from '@/lib/talent-connectors/policy'
import type { TalentConnectorPolicyRow } from '@/lib/talent-connectors/policy'
import { getTalentProviderPlugin, listTalentProviderDescriptors } from '@/lib/talent-connectors/providers/registry'
import type { TalentProviderCapability } from '@/lib/talent-connectors/providers/types'
import type { ExternalProviderEnv } from '@/lib/external-jobs/types'

const log = logger.withContext('lib/talent-connectors/service.ts', 'service')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchPolicyRow(
  supabase: SupabaseClient,
  agentId: string,
  provider: TalentProvider,
): Promise<TalentConnectorPolicyRow | null> {
  const { data } = await supabase
    .from('talent_connector_policies')
    .select('allow_discovery, allow_contact, allow_post_task, allow_payment')
    .eq('agent_id', agentId)
    .eq('provider', provider)
    .maybeSingle()

  return data
}

async function hasConfiguredCredentials(
  supabase: SupabaseClient,
  agentId: string,
  provider: TalentProvider,
  env: ExternalProviderEnv,
): Promise<boolean> {
  const { data } = await supabase
    .from('external_integrations')
    .select('id')
    .eq('agent_id', agentId)
    .eq('provider', provider)
    .eq('env', env)
    .eq('is_active', true)
    .maybeSingle()

  return data !== null
}

async function decryptProviderCredentials(
  supabase: SupabaseClient,
  agentId: string,
  provider: TalentProvider,
  env: ExternalProviderEnv,
): Promise<unknown | null> {
  const { data } = await supabase
    .from('external_integrations')
    .select('credentials_encrypted')
    .eq('agent_id', agentId)
    .eq('provider', provider)
    .eq('env', env)
    .eq('is_active', true)
    .maybeSingle()

  if (!data?.credentials_encrypted) return null

  return decryptIntegrationCredentials(data.credentials_encrypted)
}

/**
 * Run a full policy gate check for a talent connector action.
 * Returns null if allowed, or an error object if blocked.
 */
export async function checkPolicyGate(
  supabase: SupabaseClient,
  agentId: string,
  provider: TalentProvider,
  env: ExternalProviderEnv,
  capability: TalentProviderCapability,
): Promise<{ code: string; reason: string } | null> {
  const [policyRow, hasCreds] = await Promise.all([
    fetchPolicyRow(supabase, agentId, provider),
    hasConfiguredCredentials(supabase, agentId, provider, env),
  ])

  const decision = evaluateTalentConnectorPolicy({
    provider,
    capability,
    policyRow,
    hasCredentials: hasCreds,
  })

  if (!decision.allowed) {
    return { code: decision.code!, reason: decision.reason }
  }

  return null
}

// ---------------------------------------------------------------------------
// List providers (with configured status per agent)
// ---------------------------------------------------------------------------

export async function listTalentProviders(
  supabase: SupabaseClient,
  agentId: string,
) {
  const descriptors = listTalentProviderDescriptors()

  const { data: integrations } = await supabase
    .from('external_integrations')
    .select('provider, env, credentials_mask, is_active, updated_at')
    .eq('agent_id', agentId)
    .in('provider', descriptors.map((d) => d.id))

  return descriptors.map((descriptor) => {
    const configuredEnvs = (integrations ?? [])
      .filter((i) => i.provider === descriptor.id)
      .map((i) => ({
        env: i.env,
        is_active: i.is_active,
        credentials_mask: i.credentials_mask,
        updated_at: i.updated_at,
      }))

    return { ...descriptor, configured_envs: configuredEnvs }
  })
}

// ---------------------------------------------------------------------------
// Test provider connection
// ---------------------------------------------------------------------------

export async function testTalentProvider(
  supabase: SupabaseClient,
  agentId: string,
  provider: TalentProvider,
  env: ExternalProviderEnv,
): Promise<{ success: boolean; error?: string; code?: string }> {
  const gateError = await checkPolicyGate(supabase, agentId, provider, env, 'test_connection')
  if (gateError) return { success: false, ...gateError }

  const plugin = getTalentProviderPlugin(provider)
  if (!plugin.testConnection) {
    return { success: false, error: 'Provider does not support test_connection', code: TALENT_ERROR_CODES.UNSUPPORTED_PROVIDER_ACTION }
  }

  const rawCreds = await decryptProviderCredentials(supabase, agentId, provider, env)
  if (!rawCreds) {
    return { success: false, error: 'No credentials configured', code: TALENT_ERROR_CODES.CREDENTIALS_NOT_CONFIGURED }
  }

  const validation = plugin.validateCredentials(rawCreds)
  if (!validation.ok) {
    return { success: false, error: validation.error }
  }

  try {
    await plugin.testConnection({ env, credentials: validation.credentials })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection test failed'
    log.error('Test connection failed', { provider, env, agentId }, err instanceof Error ? err : undefined)
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Search workers (read-through cache)
// ---------------------------------------------------------------------------

export async function searchTalentWorkers(
  supabase: SupabaseClient,
  agentId: string,
  provider: TalentProvider,
  env: ExternalProviderEnv,
  params: { query: string; skills?: string[]; location?: string; limit?: number; offset?: number },
) {
  const gateError = await checkPolicyGate(supabase, agentId, provider, env, 'search_workers')
  if (gateError) return { ok: false as const, ...gateError }

  const plugin = getTalentProviderPlugin(provider)
  if (!plugin.searchWorkers) {
    return { ok: false as const, error: 'Provider does not support search', code: TALENT_ERROR_CODES.UNSUPPORTED_PROVIDER_ACTION }
  }

  const rawCreds = await decryptProviderCredentials(supabase, agentId, provider, env)
  if (!rawCreds) {
    return { ok: false as const, error: 'No credentials configured', code: TALENT_ERROR_CODES.CREDENTIALS_NOT_CONFIGURED }
  }

  const validation = plugin.validateCredentials(rawCreds)
  if (!validation.ok) {
    return { ok: false as const, error: validation.error }
  }

  try {
    const result = await plugin.searchWorkers({
      env,
      credentials: validation.credentials,
      ...params,
    })

    const cachedWorkerIds = new Map<string, string>()

    // Upsert workers into cache
    for (const worker of result.workers) {
      const { data: cachedWorker, error: cacheErr } = await supabase
        .from('talent_connector_workers')
        .upsert({
          agent_id: agentId,
          provider,
          env,
          provider_worker_id: worker.providerWorkerId,
          display_name: worker.displayName,
          profile_url: worker.profileUrl,
          skills_json: worker.skills,
          rate_json: worker.rateJson,
          availability_json: worker.availabilityJson,
          location: worker.location,
          rating: worker.rating,
          reviews_count: worker.reviewsCount,
          provider_payload: worker.providerPayload,
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'agent_id,provider,env,provider_worker_id',
        })
        .select('id, provider_worker_id')
        .single()

      if (cacheErr || !cachedWorker) {
        log.error('Failed to cache search result worker', {
          agentId,
          provider,
          env,
          providerWorkerId: worker.providerWorkerId,
        }, cacheErr ? { message: cacheErr.message, code: cacheErr.code } : undefined)
        return { ok: false as const, error: 'Failed to cache talent worker search results' }
      }

      cachedWorkerIds.set(cachedWorker.provider_worker_id, cachedWorker.id)
    }

    const workersWithIds = result.workers.map((worker) => ({
      ...worker,
      worker_id: cachedWorkerIds.get(worker.providerWorkerId) ?? null,
    }))

    return { ok: true as const, data: { ...result, workers: workersWithIds } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    log.error('Search workers failed', { provider, env, agentId }, err instanceof Error ? err : undefined)
    return { ok: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// Create match
// ---------------------------------------------------------------------------

export async function createTalentMatch(
  supabase: SupabaseClient,
  agentId: string,
  params: {
    provider: TalentProvider
    env: ExternalProviderEnv
    workerId: string
    bountyId?: string
    bookingId?: string
    conversationId?: string
    matchReason?: string
  },
) {
  const fnLog = logger.withContext('lib/talent-connectors/service.ts', 'createTalentMatch')

  const { data: workerRow, error: workerErr } = await supabase
    .from('talent_connector_workers')
    .select('id, provider, env')
    .eq('id', params.workerId)
    .eq('agent_id', agentId)
    .maybeSingle()

  const workerErrResponse = handleQueryError(workerErr, fnLog, 'Fetch talent worker for match', {
    agentId,
    workerId: params.workerId,
  })
  if (workerErrResponse) return { ok: false as const, response: workerErrResponse }

  if (!workerRow) {
    return { ok: false as const, response: createErrorResponse('Talent connector worker not found', 404) }
  }

  if (workerRow.provider !== params.provider || workerRow.env !== params.env) {
    return {
      ok: false as const,
      response: createErrorResponse('worker_id must match the same provider and env as the match', 422),
    }
  }

  const { data, error } = await supabase
    .from('talent_connector_matches')
    .insert({
      agent_id: agentId,
      provider: params.provider,
      env: params.env,
      worker_id: params.workerId,
      bounty_id: params.bountyId ?? null,
      booking_id: params.bookingId ?? null,
      conversation_id: params.conversationId ?? null,
      match_reason: params.matchReason ?? null,
      status: 'pending',
    })
    .select()
    .single()

  const result = handleMutationResult(data, error, fnLog, 'Create talent match', { agentId, provider: params.provider })
  if (result.response) return { ok: false as const, response: result.response }

  return { ok: true as const, data: result.data }
}

// ---------------------------------------------------------------------------
// Execute action (contact / post_task / sync) with idempotency
// ---------------------------------------------------------------------------

export async function executeTalentAction(
  supabase: SupabaseClient,
  agentId: string,
  params: {
    provider: TalentProvider
    env: ExternalProviderEnv
    actionType: 'contact' | 'post_task' | 'sync'
    idempotencyKey: string
    matchId?: string
    workerId?: string
    requestPayload: Record<string, unknown>
  },
) {
  const fnLog = logger.withContext('lib/talent-connectors/service.ts', 'executeTalentAction')

  const capabilityMap: Record<string, TalentProviderCapability> = {
    contact: 'contact_worker',
    post_task: 'create_task',
    sync: 'sync_object',
  }
  const capability = capabilityMap[params.actionType]

  const gateError = await checkPolicyGate(supabase, agentId, params.provider, params.env, capability)
  if (gateError) return { ok: false as const, ...gateError }

  // Check idempotency — existing row means already processed
  const { data: existing, error: existingErr } = await supabase
    .from('talent_connector_actions')
    .select('*')
    .eq('agent_id', agentId)
    .eq('provider', params.provider)
    .eq('env', params.env)
    .eq('idempotency_key', params.idempotencyKey)
    .maybeSingle()

  const existingErrResponse = handleQueryError(existingErr, fnLog, 'Lookup talent action idempotency row', {
    agentId, provider: params.provider, actionType: params.actionType,
  })
  if (existingErrResponse) return { ok: false as const, response: existingErrResponse }

  if (existing) {
    if (existing.status === 'success') {
      return {
        ok: true as const,
        data: {
          action: existing,
          response: existing.response_payload,
        },
      }
    }

    if (existing.status === 'failed') {
      return {
        ok: false as const,
        error: existing.error_message ?? 'Action failed previously for this idempotency key',
        code: TALENT_ERROR_CODES.TALENT_IDEMPOTENCY_CONFLICT,
        existingAction: existing,
      }
    }

    return {
      ok: false as const,
      error: 'Action already in progress for this idempotency key',
      code: TALENT_ERROR_CODES.TALENT_IDEMPOTENCY_CONFLICT,
      existingAction: existing,
    }
  }

  // Insert pending action row
  const { data: actionRow, error: insertErr } = await supabase
    .from('talent_connector_actions')
    .insert({
      agent_id: agentId,
      provider: params.provider,
      env: params.env,
      action_type: params.actionType,
      idempotency_key: params.idempotencyKey,
      match_id: params.matchId ?? null,
      worker_id: params.workerId ?? null,
      request_payload: params.requestPayload,
      status: 'pending',
    })
    .select()
    .single()

  const insertResult = handleMutationResult(actionRow, insertErr, fnLog, 'Insert talent action', {
    agentId, provider: params.provider, actionType: params.actionType,
  })
  if (insertResult.response) return { ok: false as const, response: insertResult.response }

  const persistActionOutcome = async (
    status: 'success' | 'failed',
    responsePayload: Record<string, unknown>,
    errorMessage: string | null,
  ) => {
    const { data: updatedAction, error: updateErr } = await supabase
      .from('talent_connector_actions')
      .update({
        status,
        response_payload: responsePayload,
        error_message: errorMessage,
      })
      .eq('id', insertResult.data.id)
      .eq('agent_id', agentId)
      .select()
      .single()

    return handleMutationResult(updatedAction, updateErr, fnLog, 'Update talent action outcome', {
      actionId: insertResult.data.id,
      status,
      actionType: params.actionType,
      provider: params.provider,
    })
  }

  // Execute provider call
  const plugin = getTalentProviderPlugin(params.provider)
  const rawCreds = await decryptProviderCredentials(supabase, agentId, params.provider, params.env)

  if (!rawCreds) {
    fnLog.error('No credentials for action execution', { agentId, provider: params.provider })
    const failedPersistResult = await persistActionOutcome('failed', {}, 'No credentials')
    if (failedPersistResult.response) return { ok: false as const, response: failedPersistResult.response }
    return { ok: false as const, error: 'No credentials', code: TALENT_ERROR_CODES.CREDENTIALS_NOT_CONFIGURED }
  }

  const validation = plugin.validateCredentials(rawCreds)
  if (!validation.ok) {
    const failedPersistResult = await persistActionOutcome('failed', {}, validation.error)
    if (failedPersistResult.response) return { ok: false as const, response: failedPersistResult.response }
    return { ok: false as const, error: validation.error }
  }

  try {
    let responsePayload: Record<string, unknown> = {}

    if (params.actionType === 'contact' && plugin.contactWorker) {
      const providerWorkerId = params.requestPayload.provider_worker_id as string
      const message = params.requestPayload.message as string
      responsePayload = await plugin.contactWorker({
        env: params.env,
        credentials: validation.credentials,
        providerWorkerId,
        message,
      })
    } else if (params.actionType === 'post_task' && plugin.createTaskOrBooking) {
      responsePayload = await plugin.createTaskOrBooking({
        env: params.env,
        credentials: validation.credentials,
        providerWorkerId: params.requestPayload.provider_worker_id as string,
        title: params.requestPayload.title as string,
        description: params.requestPayload.description as string,
        budgetCents: params.requestPayload.budget_cents as number | undefined,
      })
    } else if (params.actionType === 'sync' && plugin.syncObject) {
      const syncResult = await plugin.syncObject({
        env: params.env,
        credentials: validation.credentials,
        providerWorkerId: params.requestPayload.provider_worker_id as string,
      })
      responsePayload = syncResult as unknown as Record<string, unknown>
    } else {
      const failedPersistResult = await persistActionOutcome('failed', {}, `Provider does not support ${params.actionType}`)
      if (failedPersistResult.response) return { ok: false as const, response: failedPersistResult.response }
      return { ok: false as const, error: `Provider does not support ${params.actionType}`, code: TALENT_ERROR_CODES.UNSUPPORTED_PROVIDER_ACTION }
    }

    const successPersistResult = await persistActionOutcome('success', responsePayload, null)
    if (successPersistResult.response) return { ok: false as const, response: successPersistResult.response }

    fnLog.info('Talent action succeeded', {
      actionId: insertResult.data.id,
      actionType: params.actionType,
      provider: params.provider,
    })

    return { ok: true as const, data: { action: successPersistResult.data, response: responsePayload } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Action execution failed'
    fnLog.error('Talent action failed', {
      actionId: insertResult.data.id,
      actionType: params.actionType,
      provider: params.provider,
    }, err instanceof Error ? err : undefined)

    const failedPersistResult = await persistActionOutcome('failed', {}, message)
    if (failedPersistResult.response) return { ok: false as const, response: failedPersistResult.response }

    return { ok: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// List matches
// ---------------------------------------------------------------------------

export async function listTalentMatches(
  supabase: SupabaseClient,
  agentId: string,
  filters?: {
    provider?: TalentProvider
    status?: string
    bountyId?: string
    bookingId?: string
    limit?: number
    offset?: number
  },
) {
  const fnLog = logger.withContext('lib/talent-connectors/service.ts', 'listTalentMatches')

  let query = supabase
    .from('talent_connector_matches')
    .select('*, talent_connector_workers(*)', { count: 'exact' })
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })

  if (filters?.provider) query = query.eq('provider', filters.provider)
  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.bountyId) query = query.eq('bounty_id', filters.bountyId)
  if (filters?.bookingId) query = query.eq('booking_id', filters.bookingId)
  const limit = filters?.limit ?? 20
  const offset = filters?.offset ?? 0
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  const errResponse = handleQueryError(error, fnLog, 'List talent matches', { agentId })
  if (errResponse) return { ok: false as const, response: errResponse }

  return { ok: true as const, data: data ?? [], total: count ?? 0 }
}
