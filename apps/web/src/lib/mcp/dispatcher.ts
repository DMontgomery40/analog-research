import type { AgentAuth } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { ExternalProvider } from '@/lib/external-jobs/types'
import {
  calculateAgentDailySpendCents,
  evaluateExternalJobsPolicy,
  evaluateMoneyPolicy,
  loadAgentToolPolicy,
  writeAgentToolAuditLogBestEffort,
} from '@/lib/tool-policy'

import { getToolDefinition, isToolAllowedForAgent } from './tools'

export interface McpDispatchContext {
  agent: AgentAuth
  apiKey: string
  baseUrl: string
  fetchFn?: typeof fetch
  // Optional injection for tests. Production calls should omit this.
  serviceClient?: any
}

export type McpDispatchResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string }

const withQuery = (path: string, params: URLSearchParams) => {
  const query = params.toString()
  return query.length > 0 ? `${path}?${query}` : path
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, '')

async function apiRequest(
  context: McpDispatchContext,
  endpoint: string,
  method: string = 'GET',
  body?: unknown
): Promise<unknown> {
  const baseUrl = normalizeBaseUrl(context.baseUrl)
  const url = `${baseUrl}${endpoint}`
  const fetcher = context.fetchFn ?? fetch

  const response = await fetcher(url, {
    method,
    headers: {
      'Authorization': `Bearer ${context.apiKey}`,
      'Content-Type': 'application/json',
      'x-analoglabor-source': 'mcp',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      try {
        const json = await response.clone().json() as { error?: unknown; code?: unknown }
        if (typeof json?.code === 'string' && json.code === 'TOOL_POLICY_BLOCKED' && typeof json?.error === 'string') {
          throw new Error(json.error)
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Action blocked by tool policy')) {
          throw error
        }
      }
    }

    const errorBody = await response.text()
    throw new Error(`API error ${response.status}: ${errorBody}`)
  }

  return response.json()
}

function normalizeProvider(provider: unknown): ExternalProvider {
  return provider === 'wegolook' ? 'wegolook' : 'proxypics'
}

export async function dispatchMcpToolCall(
  name: string,
  args: Record<string, unknown> | undefined,
  context: McpDispatchContext
): Promise<McpDispatchResult> {
  const toolDefinition = getToolDefinition(name)
  if (!toolDefinition) {
    return { ok: false, error: `Unknown tool: ${name}` }
  }

  if (!isToolAllowedForAgent(context.agent, toolDefinition)) {
    return { ok: false, error: 'Insufficient permissions' }
  }

  const params = args ?? {}

  const getServiceClient = (() => {
    let cached: Awaited<ReturnType<typeof createServiceClient>> | null = context.serviceClient ?? null
    return async () => {
      if (!cached) cached = await createServiceClient()
      return cached
    }
  })()

  try {
    let result: unknown

    switch (name) {
      // ============ HUMANS ============
      case 'browse_humans': {
        const query = new URLSearchParams()
        if (params.skills) query.set('skills', (params.skills as string[]).join(','))
        if (params.rate_min) query.set('rate_min', String(params.rate_min))
        if (params.rate_max) query.set('rate_max', String(params.rate_max))
        if (params.available_now) query.set('available_now', 'true')
        if (params.location) query.set('location', params.location as string)
        if (params.is_remote) query.set('is_remote', 'true')
        if (params.drive_radius_miles) query.set('drive_radius_miles', String(params.drive_radius_miles))
        if (params.min_rating) query.set('min_rating', String(params.min_rating))
        if (params.limit) query.set('limit', String(params.limit))
        if (params.offset) query.set('offset', String(params.offset))
        result = await apiRequest(context, withQuery('/humans', query))
        break
      }

      case 'get_human':
        result = await apiRequest(context, `/humans/${params.human_id as string}`)
        break

      case 'list_skills': {
        const response = await apiRequest(context, '/humans?limit=100') as { data?: { skills?: string[] }[] }
        const allSkills = new Set<string>()
        response.data?.forEach((human) => {
          human.skills?.forEach((skill) => allSkills.add(skill))
        })
        result = { success: true, data: Array.from(allSkills).sort() }
        break
      }

      case 'get_reviews': {
        const query = new URLSearchParams()
        if (params.limit) query.set('limit', String(params.limit))
        if (params.offset) query.set('offset', String(params.offset))
        result = await apiRequest(
          context,
          withQuery(`/humans/${params.human_id as string}/reviews`, query)
        )
        break
      }

      // ============ CONVERSATIONS ============
      case 'start_conversation': {
        const body: { human_id: string; content?: string } = {
          human_id: params.human_id as string,
        }
        if (params.initial_message) body.content = params.initial_message as string
        result = await apiRequest(context, '/conversations', 'POST', body)
        break
      }

      case 'list_conversations': {
        const query = new URLSearchParams()
        if (params.limit) query.set('limit', String(params.limit))
        if (params.offset) query.set('offset', String(params.offset))
        result = await apiRequest(context, withQuery('/conversations', query))
        break
      }

      case 'get_conversation':
        result = await apiRequest(context, `/conversations/${params.conversation_id as string}`)
        break

      case 'send_message':
        result = await apiRequest(
          context,
          `/conversations/${params.conversation_id as string}/messages`,
          'POST',
          { content: params.content }
        )
        break

      // ============ BOUNTIES ============
      case 'create_bounty':
        result = await apiRequest(context, '/bounties', 'POST', {
          title: params.title,
          description: params.description,
          skills_required: params.skills_required,
          budget_min: params.budget_min,
          budget_max: params.budget_max,
          deadline: params.deadline,
          spots_available: params.spots_available,
          pricing_mode: params.pricing_mode,
          fixed_spot_amount: params.fixed_spot_amount,
          currency: params.currency,
          preferred_payment_method: params.preferred_payment_method,
          proof_review_mode: params.proof_review_mode,
          proof_review_prompt: params.proof_review_prompt,
        })
        break

      case 'list_bounties': {
        const query = new URLSearchParams()
        if (params.status) query.set('status', params.status as string)
        if (params.skills) query.set('skills', (params.skills as string[]).join(','))
        if (params.budget_min) query.set('budget_min', String(params.budget_min))
        if (params.budget_max) query.set('budget_max', String(params.budget_max))
        if (params.currency) query.set('currency', String(params.currency))
        if (params.pricing_mode) query.set('pricing_mode', String(params.pricing_mode))
        if (params.min_spots_remaining !== undefined) {
          query.set('min_spots_remaining', String(params.min_spots_remaining))
        }
        if (params.has_deadline) query.set('has_deadline', 'true')
        if (params.limit) query.set('limit', String(params.limit))
        if (params.offset) query.set('offset', String(params.offset))
        result = await apiRequest(context, withQuery('/bounties', query))
        break
      }

      case 'get_bounty':
        result = await apiRequest(context, `/bounties/${params.bounty_id as string}`)
        break

      case 'get_applications':
        result = await apiRequest(context, `/bounties/${params.bounty_id as string}/applications`)
        break

      case 'accept_application':
        result = await apiRequest(
          context,
          `/bounties/${params.bounty_id as string}/applications/${params.application_id as string}`,
          'PATCH',
          { status: 'accepted' }
        )
        break

      case 'reject_application':
        result = await apiRequest(
          context,
          `/bounties/${params.bounty_id as string}/applications/${params.application_id as string}`,
          'PATCH',
          { status: 'rejected', reason: params.reason }
        )
        break

      // ============ BOOKINGS ============
      case 'create_booking':
        result = await apiRequest(context, '/bookings', 'POST', {
          human_id: params.human_id,
          title: params.title,
          description: params.description,
          amount: params.amount,
          scheduled_start: params.scheduled_start,
          estimated_hours: params.estimated_hours,
        })
        break

      case 'fund_escrow':
        {
          const bookingId = params.booking_id as string
          const supabase = await getServiceClient()
          const { data: booking, error } = await supabase
            .from('bookings')
            .select('id, agent_id, amount, payer_amount, processor_fee')
            .eq('id', bookingId)
            .maybeSingle()

          if (error) {
            return { ok: false, error: error.message }
          }

          if (!booking || booking.agent_id !== context.agent.agentId) {
            return { ok: false, error: 'Forbidden' }
          }

          const policy = await loadAgentToolPolicy(supabase, context.agent.agentId)
          const payerAmount = booking.payer_amount > 0
            ? booking.payer_amount
            : booking.amount + (booking.processor_fee || 0)

          let dailySpendCents: number | undefined
          try {
            dailySpendCents = await calculateAgentDailySpendCents(supabase, context.agent.agentId)
          } catch (error) {
            const decisionReason = 'Action blocked by tool policy: unable to compute daily spend.'
            await writeAgentToolAuditLogBestEffort(supabase, {
              agentId: context.agent.agentId,
              toolName: 'fund_escrow',
              decision: 'blocked',
              reasonCode: 'MONEY_DAILY_SPEND_UNAVAILABLE',
              reason: decisionReason,
              amountCents: payerAmount,
              source: 'mcp',
              metadata: { booking_id: bookingId, error: error instanceof Error ? error.message : String(error) },
            })
            return { ok: false, error: decisionReason }
          }

          const decision = evaluateMoneyPolicy({
            policy,
            amountCents: payerAmount,
            enforceDailyCap: true,
            dailySpendCents,
          })

          if (!decision.allowed) {
            await writeAgentToolAuditLogBestEffort(supabase, {
              agentId: context.agent.agentId,
              toolName: 'fund_escrow',
              decision: 'blocked',
              reasonCode: decision.reasonCode,
              reason: decision.reason,
              amountCents: payerAmount,
              source: 'mcp',
              metadata: { booking_id: bookingId, daily_spend_cents: dailySpendCents },
            })
            return { ok: false, error: decision.reason }
          }

          result = await apiRequest(
            context,
            `/bookings/${bookingId}/fund-escrow`,
            'POST',
            { payment_method: params.payment_method || 'stripe' }
          )

          await writeAgentToolAuditLogBestEffort(supabase, {
            agentId: context.agent.agentId,
            toolName: 'fund_escrow',
            decision: 'allowed',
            reasonCode: decision.reasonCode,
            reason: decision.reason,
            amountCents: payerAmount,
            source: 'mcp',
            metadata: { booking_id: bookingId, daily_spend_cents: dailySpendCents },
          })
          break
        }

      case 'approve_work':
        {
          const bookingId = params.booking_id as string
          const proofId = params.proof_id as string

          const approved = params.approved === true
          if (approved) {
            const supabase = await getServiceClient()

            const { data: proof, error: proofError } = await supabase
              .from('proofs')
              .select('status')
              .eq('id', proofId)
              .eq('booking_id', bookingId)
              .maybeSingle()

            if (proofError) {
              return { ok: false, error: proofError.message }
            }

            // Only enforce caps on the pending -> approved transition. Retries against an already-approved proof
            // must be allowed so reconciliation can complete (e.g., payout/settlement) if a prior attempt failed.
            if (proof?.status === 'pending') {
              const { data: booking, error: bookingError } = await supabase
                .from('bookings')
                .select('id, agent_id, amount, payer_amount, processor_fee')
                .eq('id', bookingId)
                .maybeSingle()

              if (bookingError) {
                return { ok: false, error: bookingError.message }
              }

              if (!booking || booking.agent_id !== context.agent.agentId) {
                return { ok: false, error: 'Forbidden' }
              }

              const policy = await loadAgentToolPolicy(supabase, context.agent.agentId)
              const payerAmount = booking.payer_amount > 0
                ? booking.payer_amount
                : booking.amount + (booking.processor_fee || 0)

              const decision = evaluateMoneyPolicy({
                policy,
                amountCents: payerAmount,
                enforceDailyCap: false,
              })

              if (!decision.allowed) {
                await writeAgentToolAuditLogBestEffort(supabase, {
                  agentId: context.agent.agentId,
                  toolName: 'approve_work',
                  decision: 'blocked',
                  reasonCode: decision.reasonCode,
                  reason: decision.reason,
                  amountCents: payerAmount,
                  source: 'mcp',
                  metadata: { booking_id: bookingId, proof_id: proofId },
                })

                return { ok: false, error: decision.reason }
              }

              result = await apiRequest(
                context,
                `/bookings/${bookingId}/proof/${proofId}`,
                'PATCH',
                { approved: true, feedback: params.feedback }
              )

              await writeAgentToolAuditLogBestEffort(supabase, {
                agentId: context.agent.agentId,
                toolName: 'approve_work',
                decision: 'allowed',
                reasonCode: decision.reasonCode,
                reason: decision.reason,
                amountCents: payerAmount,
                source: 'mcp',
                metadata: { booking_id: bookingId, proof_id: proofId },
              })
              break
            }
          }

          result = await apiRequest(
            context,
            `/bookings/${bookingId}/proof/${proofId}`,
            'PATCH',
            {
              approved: params.approved,
              feedback: params.feedback,
            }
          )
          break
        }

      // ============ REVIEWS ============
      case 'submit_review':
        result = await apiRequest(context, '/reviews', 'POST', {
          booking_id: params.booking_id,
          rating: params.rating,
          comment: params.comment,
        })
        break

      // ============ FIELD CHECKS (EXTERNAL JOBS) ============
      case 'list_integration_providers':
        result = await apiRequest(context, '/integrations/providers')
        break

      case 'create_external_job':
      case 'create_field_check':
        {
          const provider = normalizeProvider(params.provider)
          const supabase = await getServiceClient()
          const policy = await loadAgentToolPolicy(supabase, context.agent.agentId)
          const decision = evaluateExternalJobsPolicy({ policy, provider })

          if (!decision.allowed) {
            await writeAgentToolAuditLogBestEffort(supabase, {
              agentId: context.agent.agentId,
              toolName: name,
              decision: 'blocked',
              reasonCode: decision.reasonCode,
              reason: decision.reason,
              provider,
              source: 'mcp',
              metadata: { provider_env: params.provider_env ?? 'live' },
            })
            return { ok: false, error: decision.reason }
          }

          result = await apiRequest(context, '/external-jobs', 'POST', {
            kind: (name === 'create_external_job' ? params.kind : 'field_check') ?? 'field_check',
            title: params.title,
            instructions: params.instructions,
            address: params.address,
            provider: params.provider,
            provider_env: params.provider_env,
            expires_at: params.expires_at,
            scheduled_at: params.scheduled_at,
            public_only: params.public_only,
            auto_approve: params.auto_approve,
            template_token: params.template_token,
            tasks: params.tasks,
            price_boost_cents: params.price_boost_cents,
            unlimited_tasks: params.unlimited_tasks,
            unlimited_tasks_descriptions: params.unlimited_tasks_descriptions,
            bounty_id: params.bounty_id,
            booking_id: params.booking_id,
            application_id: params.application_id,
            conversation_id: params.conversation_id,
          })

          await writeAgentToolAuditLogBestEffort(supabase, {
            agentId: context.agent.agentId,
            toolName: name,
            decision: 'allowed',
            reasonCode: decision.reasonCode,
            reason: decision.reason,
            provider,
            source: 'mcp',
            metadata: { provider_env: params.provider_env ?? 'live' },
          })
          break
        }

      case 'list_external_jobs':
      case 'list_field_checks': {
        const query = new URLSearchParams()
        if (name === 'list_field_checks') {
          query.set('kind', 'field_check')
        } else if (params.kind) {
          query.set('kind', String(params.kind))
        }
        if (params.status) query.set('status', String(params.status))
        if (params.provider) query.set('provider', String(params.provider))
        if (params.provider_env) query.set('provider_env', String(params.provider_env))
        if (params.limit) query.set('limit', String(params.limit))
        if (params.offset) query.set('offset', String(params.offset))
        if (params.bounty_id) query.set('bounty_id', String(params.bounty_id))
        if (params.booking_id) query.set('booking_id', String(params.booking_id))
        if (params.application_id) query.set('application_id', String(params.application_id))
        if (params.conversation_id) query.set('conversation_id', String(params.conversation_id))
        result = await apiRequest(context, withQuery('/external-jobs', query))
        break
      }

      case 'get_external_job':
      case 'get_field_check':
        result = await apiRequest(
          context,
          `/external-jobs/${(name === 'get_external_job' ? params.external_job_id : params.field_check_id) as string}`
        )
        break

      case 'refresh_external_job':
      case 'refresh_field_check':
        result = await apiRequest(
          context,
          `/external-jobs/${(name === 'refresh_external_job' ? params.external_job_id : params.field_check_id) as string}/refresh`,
          'POST'
        )
        break

      case 'cancel_external_job':
      case 'cancel_field_check':
        result = await apiRequest(
          context,
          `/external-jobs/${(name === 'cancel_external_job' ? params.external_job_id : params.field_check_id) as string}/cancel`,
          'POST'
        )
        break

      case 'send_external_job_message':
      case 'send_field_check_message':
        result = await apiRequest(
          context,
          `/external-jobs/${(name === 'send_external_job_message' ? params.external_job_id : params.field_check_id) as string}/messages`,
          'POST',
          {
            text: params.text,
          }
        )
        break

      case 'approve_external_job':
      case 'approve_field_check':
        {
          const jobId = (name === 'approve_external_job' ? params.external_job_id : params.field_check_id) as string
          const supabase = await getServiceClient()
          const { data: job, error } = await supabase
            .from('external_jobs')
            .select('provider, agent_id')
            .eq('id', jobId)
            .maybeSingle()

          if (error) {
            return { ok: false, error: error.message }
          }

          if (!job || job.agent_id !== context.agent.agentId) {
            return { ok: false, error: 'Forbidden' }
          }

          const provider = job.provider as ExternalProvider
          const policy = await loadAgentToolPolicy(supabase, context.agent.agentId)
          const decision = evaluateExternalJobsPolicy({ policy, provider })

          if (!decision.allowed) {
            await writeAgentToolAuditLogBestEffort(supabase, {
              agentId: context.agent.agentId,
              toolName: name,
              decision: 'blocked',
              reasonCode: decision.reasonCode,
              reason: decision.reason,
              provider,
              source: 'mcp',
              metadata: { external_job_id: jobId },
            })
            return { ok: false, error: decision.reason }
          }

          result = await apiRequest(
            context,
            `/external-jobs/${jobId}/approve`,
            'POST'
          )

          await writeAgentToolAuditLogBestEffort(supabase, {
            agentId: context.agent.agentId,
            toolName: name,
            decision: 'allowed',
            reasonCode: decision.reasonCode,
            reason: decision.reason,
            provider,
            source: 'mcp',
            metadata: { external_job_id: jobId },
          })
          break
        }

      case 'reject_external_job':
      case 'reject_field_check':
        result = await apiRequest(
          context,
          `/external-jobs/${(name === 'reject_external_job' ? params.external_job_id : params.field_check_id) as string}/reject`,
          'POST',
          {
            reason: params.reason,
            clarification: params.clarification,
          }
        )
        break

      // ============ NOTIFICATIONS ============
      case 'list_notifications': {
        const query = new URLSearchParams()
        if (params.unread_only !== undefined) query.set('unread_only', String(params.unread_only))
        if (params.limit) query.set('limit', String(params.limit))
        if (params.offset) query.set('offset', String(params.offset))
        if (params.types) query.set('types', (params.types as string[]).join(','))
        result = await apiRequest(context, withQuery('/agent/notifications', query))
        break
      }

      case 'mark_notifications_read':
        result = await apiRequest(context, '/agent/notifications', 'PATCH', {
          notification_ids: params.notification_ids,
          mark_all: params.mark_all,
        })
        break

      case 'get_unread_count': {
        const response = await apiRequest(
          context,
          '/agent/notifications?unread_only=true&limit=1'
        ) as { data?: { unread_count?: number } }
        result = {
          success: true,
          data: {
            unread_count: response.data?.unread_count ?? 0,
          },
        }
        break
      }

      case 'list_notification_channels':
        result = await apiRequest(context, '/notification-channels')
        break

      case 'create_notification_channel':
        result = await apiRequest(context, '/notification-channels', 'POST', {
          channel_type: params.channel_type,
          channel_config: params.channel_config,
          name: params.name,
          enabled: params.enabled,
        })
        break

      case 'update_notification_channel':
        result = await apiRequest(context, `/notification-channels/${params.channel_id as string}`, 'PATCH', {
          channel_config: params.channel_config,
          name: params.name,
          enabled: params.enabled,
        })
        break

      case 'delete_notification_channel':
        result = await apiRequest(context, `/notification-channels/${params.channel_id as string}`, 'DELETE')
        break

      case 'test_notification_channel':
        result = await apiRequest(context, `/notification-channels/${params.channel_id as string}/test`, 'POST')
        break

      // ============ TALENT CONNECTORS ============
      case 'list_talent_connectors':
        result = await apiRequest(context, '/talent-connectors/providers')
        break

      case 'test_talent_connector':
        result = await apiRequest(context, `/talent-connectors/providers/${params.provider as string}/test`, 'POST', {
          env: params.env ?? 'live',
        })
        break

      case 'search_connector_workers': {
        const searchQuery = new URLSearchParams()
        searchQuery.set('provider', params.provider as string)
        searchQuery.set('q', params.q as string)
        if (params.env) searchQuery.set('env', String(params.env))
        if (params.skills) searchQuery.set('skills', String(params.skills))
        if (params.location) searchQuery.set('location', String(params.location))
        if (params.limit) searchQuery.set('limit', String(params.limit))
        if (params.offset) searchQuery.set('offset', String(params.offset))
        result = await apiRequest(context, withQuery('/talent-connectors/workers/search', searchQuery))
        break
      }

      case 'create_connector_match':
        result = await apiRequest(context, '/talent-connectors/matches', 'POST', {
          provider: params.provider,
          env: params.env ?? 'live',
          worker_id: params.worker_id,
          bounty_id: params.bounty_id,
          booking_id: params.booking_id,
          conversation_id: params.conversation_id,
          match_reason: params.match_reason,
        })
        break

      case 'list_connector_matches': {
        const matchQuery = new URLSearchParams()
        if (params.provider) matchQuery.set('provider', String(params.provider))
        if (params.status) matchQuery.set('status', String(params.status))
        if (params.bounty_id) matchQuery.set('bounty_id', String(params.bounty_id))
        if (params.booking_id) matchQuery.set('booking_id', String(params.booking_id))
        if (params.limit) matchQuery.set('limit', String(params.limit))
        if (params.offset) matchQuery.set('offset', String(params.offset))
        result = await apiRequest(context, withQuery('/talent-connectors/matches', matchQuery))
        break
      }

      case 'contact_connector_worker':
        result = await apiRequest(context, '/talent-connectors/actions/contact', 'POST', {
          provider: params.provider,
          env: params.env ?? 'live',
          idempotency_key: params.idempotency_key,
          provider_worker_id: params.provider_worker_id,
          message: params.message,
          match_id: params.match_id,
          worker_id: params.worker_id,
        })
        break

      case 'post_connector_task':
        result = await apiRequest(context, '/talent-connectors/actions/post-task', 'POST', {
          provider: params.provider,
          env: params.env ?? 'live',
          idempotency_key: params.idempotency_key,
          provider_worker_id: params.provider_worker_id,
          title: params.title,
          description: params.description,
          budget_cents: params.budget_cents,
          match_id: params.match_id,
          worker_id: params.worker_id,
        })
        break

      case 'sync_connector_action':
        result = await apiRequest(context, '/talent-connectors/actions/sync', 'POST', {
          provider: params.provider,
          env: params.env ?? 'live',
          idempotency_key: params.idempotency_key,
          provider_worker_id: params.provider_worker_id,
          match_id: params.match_id,
          worker_id: params.worker_id,
        })
        break

      default:
        return { ok: false, error: `Unknown tool: ${name}` }
    }

    return { ok: true, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { ok: false, error: message }
  }
}
