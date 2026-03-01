import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { MCP_TOOLS } from './tools.js'

const API_BASE_URL = process.env.ANALOGLABOR_API_URL || 'https://analoglabor.com/api/v1'
const API_KEY = process.env.ANALOGLABOR_API_KEY

if (!API_KEY) {
  console.error('ANALOGLABOR_API_KEY environment variable is required')
  process.exit(1)
}

async function apiRequest(
  endpoint: string,
  method: string = 'GET',
  body?: unknown
): Promise<unknown> {
  const url = `${API_BASE_URL}${endpoint}`
  let response: Response

  try {
    response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    const baseHint = `Network error calling ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`
    const localHint = /^(http:\/\/localhost|http:\/\/127\.0\.0\.1)(:\d+)?(\/|$)/.test(API_BASE_URL)
      ? ` Is your local API running? Try: pnpm --filter @analoglabor/web dev`
      : ''
    throw new Error(`${baseHint}.${localHint}`)
  }

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error ${response.status}: ${error}`)
  }

  return response.json()
}

const tools = MCP_TOOLS

const server = new Server(
  {
    name: 'analoglabor-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    let result: unknown

    switch (name) {
      // ============ HUMANS ============
      case 'browse_humans': {
        const params = new URLSearchParams()
        if (args?.skills) params.set('skills', (args.skills as string[]).join(','))
        if (args?.rate_min) params.set('rate_min', String(args.rate_min))
        if (args?.rate_max) params.set('rate_max', String(args.rate_max))
        if (args?.available_now) params.set('available_now', 'true')
        if (args?.location) params.set('location', args.location as string)
        if (args?.is_remote) params.set('is_remote', 'true')
        if (args?.min_rating) params.set('min_rating', String(args.min_rating))
        if (args?.limit) params.set('limit', String(args.limit))
        if (args?.offset) params.set('offset', String(args.offset))
        result = await apiRequest(`/humans?${params}`)
        break
      }

      case 'get_human':
        result = await apiRequest(`/humans/${args?.human_id}`)
        break

      case 'list_skills': {
        // Get unique skills from all humans (paginated; avoids silent truncation at 100).
        const limit = 100
        const maxPages = 200 // safety bound (20k humans at limit=100)

        const allSkills = new Set<string>()

        for (let page = 0; page < maxPages; page++) {
          const offset = page * limit
          const response = await apiRequest(`/humans?limit=${limit}&offset=${offset}`) as { data?: { skills?: string[] }[] }
          const humans = response.data || []

          humans.forEach((human: { skills?: string[] }) => {
            human.skills?.forEach((skill) => allSkills.add(skill))
          })

          if (humans.length < limit) {
            break
          }
        }

        result = { success: true, data: Array.from(allSkills).sort() }
        break
      }

      case 'get_reviews': {
        const params = new URLSearchParams()
        if (args?.limit) params.set('limit', String(args.limit))
        if (args?.offset) params.set('offset', String(args.offset))
        result = await apiRequest(`/humans/${args?.human_id}/reviews?${params}`)
        break
      }

      // ============ CONVERSATIONS ============
      case 'start_conversation': {
        const body: { human_id: string; content?: string } = { human_id: args?.human_id as string }
        if (args?.initial_message) body.content = args.initial_message as string
        result = await apiRequest('/conversations', 'POST', body)
        break
      }

      case 'list_conversations': {
        const params = new URLSearchParams()
        if (args?.limit) params.set('limit', String(args.limit))
        if (args?.offset) params.set('offset', String(args.offset))
        result = await apiRequest(`/conversations?${params}`)
        break
      }

      case 'get_conversation':
        result = await apiRequest(`/conversations/${args?.conversation_id}`)
        break

      case 'send_message':
        result = await apiRequest(
          `/conversations/${args?.conversation_id}/messages`,
          'POST',
          { content: args?.content }
        )
        break

      // ============ BOUNTIES ============
      case 'create_bounty':
        result = await apiRequest('/bounties', 'POST', {
          title: args?.title,
          description: args?.description,
          skills_required: args?.skills_required,
          budget_min: args?.budget_min,
          budget_max: args?.budget_max,
          deadline: args?.deadline,
          spots_available: args?.spots_available,
          pricing_mode: args?.pricing_mode,
          fixed_spot_amount: args?.fixed_spot_amount,
          currency: args?.currency,
          preferred_payment_method: args?.preferred_payment_method,
          proof_review_mode: args?.proof_review_mode,
          proof_review_prompt: args?.proof_review_prompt,
        })
        break

      case 'list_bounties': {
        const params = new URLSearchParams()
        if (args?.status) params.set('status', args.status as string)
        if (args?.skills) params.set('skills', (args.skills as string[]).join(','))
        if (args?.budget_min) params.set('budget_min', String(args.budget_min))
        if (args?.budget_max) params.set('budget_max', String(args.budget_max))
        if (args?.currency) params.set('currency', String(args.currency))
        if (args?.pricing_mode) params.set('pricing_mode', String(args.pricing_mode))
        if (args?.min_spots_remaining !== undefined) params.set('min_spots_remaining', String(args.min_spots_remaining))
        if (args?.has_deadline) params.set('has_deadline', 'true')
        if (args?.limit) params.set('limit', String(args.limit))
        if (args?.offset) params.set('offset', String(args.offset))
        result = await apiRequest(`/bounties?${params}`)
        break
      }

      case 'get_bounty':
        result = await apiRequest(`/bounties/${args?.bounty_id}`)
        break

      case 'get_applications':
        result = await apiRequest(`/bounties/${args?.bounty_id}/applications`)
        break

      case 'accept_application':
        result = await apiRequest(
          `/bounties/${args?.bounty_id}/applications/${args?.application_id}`,
          'PATCH',
          { status: 'accepted' }
        )
        break

      case 'reject_application':
        result = await apiRequest(
          `/bounties/${args?.bounty_id}/applications/${args?.application_id}`,
          'PATCH',
          { status: 'rejected', reason: args?.reason }
        )
        break

      // ============ BOOKINGS ============
      case 'create_booking':
        result = await apiRequest('/bookings', 'POST', {
          human_id: args?.human_id,
          title: args?.title,
          description: args?.description,
          amount: args?.amount,
          scheduled_start: args?.scheduled_start,
          estimated_hours: args?.estimated_hours,
        })
        break

      case 'fund_escrow':
        result = await apiRequest(`/bookings/${args?.booking_id}/fund-escrow`, 'POST', {
          payment_method: args?.payment_method || 'stripe',
        })
        break

      case 'approve_work':
        result = await apiRequest(
          `/bookings/${args?.booking_id}/proof/${args?.proof_id}`,
          'PATCH',
          {
            approved: args?.approved,
            feedback: args?.feedback,
          }
        )
        break

      // ============ REVIEWS ============
      case 'submit_review':
        result = await apiRequest('/reviews', 'POST', {
          booking_id: args?.booking_id,
          rating: args?.rating,
          comment: args?.comment,
        })
        break

      // ============ FIELD CHECKS (EXTERNAL JOBS) ============
      case 'list_integration_providers':
        result = await apiRequest('/integrations/providers')
        break

      case 'create_external_job':
      case 'create_field_check':
        result = await apiRequest('/external-jobs', 'POST', {
          kind: (name === 'create_external_job' ? args?.kind : 'field_check') ?? 'field_check',
          title: args?.title,
          instructions: args?.instructions,
          address: args?.address,
          provider: args?.provider,
          provider_env: args?.provider_env,
          expires_at: args?.expires_at,
          scheduled_at: args?.scheduled_at,
          public_only: args?.public_only,
          auto_approve: args?.auto_approve,
          template_token: args?.template_token,
          tasks: args?.tasks,
          price_boost_cents: args?.price_boost_cents,
          unlimited_tasks: args?.unlimited_tasks,
          unlimited_tasks_descriptions: args?.unlimited_tasks_descriptions,
          bounty_id: args?.bounty_id,
          booking_id: args?.booking_id,
          application_id: args?.application_id,
          conversation_id: args?.conversation_id,
        })
        break

      case 'list_external_jobs': {
        const params = new URLSearchParams()
        if (args?.kind) params.set('kind', String(args.kind))
        if (args?.status) params.set('status', String(args.status))
        if (args?.provider) params.set('provider', String(args.provider))
        if (args?.provider_env) params.set('provider_env', String(args.provider_env))
        if (args?.limit) params.set('limit', String(args.limit))
        if (args?.offset) params.set('offset', String(args.offset))
        if (args?.bounty_id) params.set('bounty_id', String(args.bounty_id))
        if (args?.booking_id) params.set('booking_id', String(args.booking_id))
        if (args?.application_id) params.set('application_id', String(args.application_id))
        if (args?.conversation_id) params.set('conversation_id', String(args.conversation_id))
        result = await apiRequest(`/external-jobs?${params}`)
        break
      }

      case 'list_field_checks': {
        const params = new URLSearchParams()
        params.set('kind', 'field_check')
        if (args?.status) params.set('status', String(args.status))
        if (args?.provider) params.set('provider', String(args.provider))
        if (args?.provider_env) params.set('provider_env', String(args.provider_env))
        if (args?.limit) params.set('limit', String(args.limit))
        if (args?.offset) params.set('offset', String(args.offset))
        if (args?.bounty_id) params.set('bounty_id', String(args.bounty_id))
        if (args?.booking_id) params.set('booking_id', String(args.booking_id))
        if (args?.application_id) params.set('application_id', String(args.application_id))
        if (args?.conversation_id) params.set('conversation_id', String(args.conversation_id))
        result = await apiRequest(`/external-jobs?${params}`)
        break
      }

      case 'get_external_job':
        result = await apiRequest(`/external-jobs/${args?.external_job_id}`)
        break

      case 'get_field_check':
        result = await apiRequest(`/external-jobs/${args?.field_check_id}`)
        break

      case 'refresh_external_job':
        result = await apiRequest(`/external-jobs/${args?.external_job_id}/refresh`, 'POST')
        break

      case 'refresh_field_check':
        result = await apiRequest(`/external-jobs/${args?.field_check_id}/refresh`, 'POST')
        break

      case 'cancel_external_job':
        result = await apiRequest(`/external-jobs/${args?.external_job_id}/cancel`, 'POST')
        break

      case 'cancel_field_check':
        result = await apiRequest(`/external-jobs/${args?.field_check_id}/cancel`, 'POST')
        break

      case 'send_external_job_message':
        result = await apiRequest(`/external-jobs/${args?.external_job_id}/messages`, 'POST', {
          text: args?.text,
        })
        break

      case 'send_field_check_message':
        result = await apiRequest(`/external-jobs/${args?.field_check_id}/messages`, 'POST', { text: args?.text })
        break

      case 'approve_external_job':
        result = await apiRequest(`/external-jobs/${args?.external_job_id}/approve`, 'POST')
        break

      case 'approve_field_check':
        result = await apiRequest(`/external-jobs/${args?.field_check_id}/approve`, 'POST')
        break

      case 'reject_external_job':
        result = await apiRequest(`/external-jobs/${args?.external_job_id}/reject`, 'POST', {
          reason: args?.reason,
          clarification: args?.clarification,
        })
        break

      case 'reject_field_check':
        result = await apiRequest(`/external-jobs/${args?.field_check_id}/reject`, 'POST', {
          reason: args?.reason,
          clarification: args?.clarification,
        })
        break

      // ============ NOTIFICATIONS ============
      case 'list_notifications': {
        const params = new URLSearchParams()
        if (args?.unread_only !== undefined) params.set('unread_only', String(args.unread_only))
        if (args?.limit) params.set('limit', String(args.limit))
        if (args?.offset) params.set('offset', String(args.offset))
        if (args?.types) params.set('types', (args.types as string[]).join(','))
        result = await apiRequest(`/agent/notifications?${params}`)
        break
      }

      case 'mark_notifications_read':
        result = await apiRequest('/agent/notifications', 'PATCH', {
          notification_ids: args?.notification_ids,
          mark_all: args?.mark_all,
        })
        break

      case 'get_unread_count': {
        const response = await apiRequest('/agent/notifications?unread_only=true&limit=1') as { data?: { unread_count?: number } }
        result = {
          success: true,
          data: {
            unread_count: response.data?.unread_count ?? 0,
          },
        }
        break
      }

      case 'list_notification_channels':
        result = await apiRequest('/notification-channels')
        break

      case 'create_notification_channel':
        result = await apiRequest('/notification-channels', 'POST', {
          channel_type: args?.channel_type,
          channel_config: args?.channel_config,
          name: args?.name,
          enabled: args?.enabled,
        })
        break

      case 'update_notification_channel':
        result = await apiRequest(`/notification-channels/${args?.channel_id}`, 'PATCH', {
          channel_config: args?.channel_config,
          name: args?.name,
          enabled: args?.enabled,
        })
        break

      case 'delete_notification_channel':
        result = await apiRequest(`/notification-channels/${args?.channel_id}`, 'DELETE')
        break

      case 'test_notification_channel':
        result = await apiRequest(`/notification-channels/${args?.channel_id}/test`, 'POST')
        break

      // ============ TALENT CONNECTORS ============
      case 'list_talent_connectors':
        result = await apiRequest('/talent-connectors/providers')
        break

      case 'test_talent_connector':
        result = await apiRequest(`/talent-connectors/providers/${args?.provider as string}/test`, 'POST', {
          env: args?.env ?? 'live',
        })
        break

      case 'search_connector_workers': {
        const swParams = new URLSearchParams()
        swParams.set('provider', args?.provider as string)
        swParams.set('q', args?.q as string)
        if (args?.env) swParams.set('env', String(args.env))
        if (args?.skills) swParams.set('skills', String(args.skills))
        if (args?.location) swParams.set('location', String(args.location))
        if (args?.limit) swParams.set('limit', String(args.limit))
        if (args?.offset) swParams.set('offset', String(args.offset))
        result = await apiRequest(`/talent-connectors/workers/search?${swParams}`)
        break
      }

      case 'create_connector_match':
        result = await apiRequest('/talent-connectors/matches', 'POST', {
          provider: args?.provider,
          env: args?.env ?? 'live',
          worker_id: args?.worker_id,
          bounty_id: args?.bounty_id,
          booking_id: args?.booking_id,
          conversation_id: args?.conversation_id,
          match_reason: args?.match_reason,
        })
        break

      case 'list_connector_matches': {
        const lmParams = new URLSearchParams()
        if (args?.provider) lmParams.set('provider', String(args.provider))
        if (args?.status) lmParams.set('status', String(args.status))
        if (args?.bounty_id) lmParams.set('bounty_id', String(args.bounty_id))
        if (args?.booking_id) lmParams.set('booking_id', String(args.booking_id))
        if (args?.limit) lmParams.set('limit', String(args.limit))
        if (args?.offset) lmParams.set('offset', String(args.offset))
        result = await apiRequest(`/talent-connectors/matches?${lmParams}`)
        break
      }

      case 'contact_connector_worker':
        result = await apiRequest('/talent-connectors/actions/contact', 'POST', {
          provider: args?.provider,
          env: args?.env ?? 'live',
          idempotency_key: args?.idempotency_key,
          provider_worker_id: args?.provider_worker_id,
          message: args?.message,
          match_id: args?.match_id,
          worker_id: args?.worker_id,
        })
        break

      case 'post_connector_task':
        result = await apiRequest('/talent-connectors/actions/post-task', 'POST', {
          provider: args?.provider,
          env: args?.env ?? 'live',
          idempotency_key: args?.idempotency_key,
          provider_worker_id: args?.provider_worker_id,
          title: args?.title,
          description: args?.description,
          budget_cents: args?.budget_cents,
          match_id: args?.match_id,
          worker_id: args?.worker_id,
        })
        break

      case 'sync_connector_action':
        result = await apiRequest('/talent-connectors/actions/sync', 'POST', {
          provider: args?.provider,
          env: args?.env ?? 'live',
          idempotency_key: args?.idempotency_key,
          provider_worker_id: args?.provider_worker_id,
          match_id: args?.match_id,
          worker_id: args?.worker_id,
        })
        break

      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('AnalogLabor MCP server running')
}

main().catch(console.error)

export {}
