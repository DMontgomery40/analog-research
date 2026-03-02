import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export type ToolAccess = 'read' | 'write'

export interface McpToolDefinition {
  tool: Tool
  access: ToolAccess
}

export const MCP_UI_RESOURCE_URIS = {
  generic: 'ui://analogresearch/result-shell/v1',
  humans: 'ui://analogresearch/humans/browse/v1',
  bounties: 'ui://analogresearch/bounties/list/v1',
  conversations: 'ui://analogresearch/conversations/thread/v1',
  bookings: 'ui://analogresearch/bookings/overview/v1',
} as const

export type McpUiResourceUri = (typeof MCP_UI_RESOURCE_URIS)[keyof typeof MCP_UI_RESOURCE_URIS]

export function getMcpToolUiResourceUri(toolName: string): McpUiResourceUri {
  switch (toolName) {
    // Humans
    case 'browse_humans':
    case 'get_human':
    case 'list_skills':
    case 'get_reviews':
      return MCP_UI_RESOURCE_URIS.humans

    // Bounties
    case 'create_bounty':
    case 'list_bounties':
    case 'get_bounty':
    case 'get_applications':
    case 'accept_application':
    case 'reject_application':
      return MCP_UI_RESOURCE_URIS.bounties

    // Conversations
    case 'start_conversation':
    case 'list_conversations':
    case 'get_conversation':
    case 'send_message':
      return MCP_UI_RESOURCE_URIS.conversations

    // Bookings + proof/review flows
    case 'create_booking':
    case 'fund_escrow':
    case 'approve_work':
    case 'submit_review':
      return MCP_UI_RESOURCE_URIS.bookings

    default:
      return MCP_UI_RESOURCE_URIS.generic
  }
}

type OAuthSecurityScheme = {
  type: 'oauth2'
  scopes: string[]
}

const READ_SCOPE = (process.env.MCP_OAUTH_SCOPES_READ || 'analogresearch.read').trim() || 'analogresearch.read'
const WRITE_SCOPE = (process.env.MCP_OAUTH_SCOPES_WRITE || 'analogresearch.write').trim() || 'analogresearch.write'

const readSecuritySchemes: OAuthSecurityScheme[] = [{ type: 'oauth2', scopes: [READ_SCOPE] }]
const writeSecuritySchemes: OAuthSecurityScheme[] = [{ type: 'oauth2', scopes: [WRITE_SCOPE] }]

function withMetadata(
  tool: Tool,
  params: {
    access: ToolAccess
    destructiveHint: boolean
    openWorldHint: boolean
    readOnlyHint: boolean
  }
): Tool {
  const securitySchemes = params.access === 'read' ? readSecuritySchemes : writeSecuritySchemes
  const toolWithMeta = tool as Tool & { _meta?: Record<string, unknown>; securitySchemes?: OAuthSecurityScheme[] }
  const existingMeta = toolWithMeta._meta || {}
  const existingUi = typeof existingMeta.ui === 'object' && existingMeta.ui
    ? existingMeta.ui as Record<string, unknown>
    : {}
  const resourceUri = getMcpToolUiResourceUri(tool.name)

  const enriched = {
    ...toolWithMeta,
    annotations: {
      ...tool.annotations,
      readOnlyHint: params.readOnlyHint,
      openWorldHint: params.openWorldHint,
      destructiveHint: params.destructiveHint,
    },
    securitySchemes,
    _meta: {
      ...existingMeta,
      securitySchemes,
      ui: {
        ...existingUi,
        resourceUri,
      },
      ['openai/outputTemplate']: resourceUri,
    },
  }

  return enriched as unknown as Tool
}

const withReadOnly = (tool: Tool): McpToolDefinition => ({
  tool: withMetadata(tool, {
    access: 'read',
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  }),
  access: 'read',
})

const withDestructive = (tool: Tool): McpToolDefinition => ({
  tool: withMetadata(tool, {
    access: 'write',
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
  }),
  access: 'write',
})

const withOpenWorldRead = (tool: Tool): McpToolDefinition => ({
  tool: withMetadata(tool, {
    access: 'read',
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
  }),
  access: 'read',
})

const withOpenWorldWrite = (tool: Tool): McpToolDefinition => ({
  tool: withMetadata(tool, {
    access: 'write',
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
  }),
  access: 'write',
})

const withIrreversibleWrite = (tool: Tool): McpToolDefinition => ({
  tool: withMetadata(tool, {
    access: 'write',
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
  }),
  access: 'write',
})

const withOpenWorldIrreversibleWrite = (tool: Tool): McpToolDefinition => ({
  tool: withMetadata(tool, {
    access: 'write',
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
  }),
  access: 'write',
})

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  // ============ HUMANS ============
  withReadOnly({
    name: 'browse_humans',
    description: 'Search for available humans by skills, rate range, location, and availability',
    inputSchema: {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Skills to filter by (e.g., ["qa-testing", "mobile"])',
        },
        rate_min: {
          type: 'number',
          description: 'Minimum hourly rate in cents',
        },
        rate_max: {
          type: 'number',
          description: 'Maximum hourly rate in cents',
        },
        available_now: {
          type: 'boolean',
          description: 'Only show humans available at current time',
        },
        location: {
          type: 'string',
          description: 'Filter by city, state, or country',
        },
        is_remote: {
          type: 'boolean',
          description: 'Filter for remote-available humans',
        },
        drive_radius_miles: {
          type: 'number',
          description: 'Minimum in-person travel radius required (miles). Filters for humans willing to travel at least this far.',
        },
        min_rating: {
          type: 'number',
          description: 'Minimum rating (1-5)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
      },
    },
  }),
  withReadOnly({
    name: 'get_human',
    description: 'Get detailed profile of a specific human including availability schedule',
    inputSchema: {
      type: 'object',
      properties: {
        human_id: {
          type: 'string',
          description: 'The UUID of the human to retrieve',
        },
      },
      required: ['human_id'],
    },
  }),
  withReadOnly({
    name: 'list_skills',
    description: 'Get a list of all available skills in the marketplace',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  }),
  withReadOnly({
    name: 'get_reviews',
    description: 'Get reviews for a specific human',
    inputSchema: {
      type: 'object',
      properties: {
        human_id: {
          type: 'string',
          description: 'The UUID of the human',
        },
        limit: {
          type: 'number',
          description: 'Maximum reviews to return (default 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
      },
      required: ['human_id'],
    },
  }),

  // ============ CONVERSATIONS ============
  withDestructive({
    name: 'start_conversation',
    description: 'Start a new conversation with a human',
    inputSchema: {
      type: 'object',
      properties: {
        human_id: {
          type: 'string',
          description: 'The UUID of the human to start conversation with',
        },
        initial_message: {
          type: 'string',
          description: 'Optional initial message to send',
        },
      },
      required: ['human_id'],
    },
  }),
  withReadOnly({
    name: 'list_conversations',
    description: 'List all your conversations with humans',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum conversations to return (default 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
      },
    },
  }),
  withReadOnly({
    name: 'get_conversation',
    description: 'Get a conversation with all its messages',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: {
          type: 'string',
          description: 'The UUID of the conversation',
        },
      },
      required: ['conversation_id'],
    },
  }),
  withDestructive({
    name: 'send_message',
    description: 'Send a message in an existing conversation',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: {
          type: 'string',
          description: 'The UUID of the conversation',
        },
        content: {
          type: 'string',
          description: 'The message content',
        },
      },
      required: ['conversation_id', 'content'],
    },
  }),

  // ============ BOUNTIES ============
  withDestructive({
    name: 'create_bounty',
    description: 'Post a new task bounty for humans to apply to. Supports multi-spot capacity and fixed-per-spot pricing.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the task',
        },
        description: {
          type: 'string',
          description: 'Detailed description of what needs to be done',
        },
        skills_required: {
          type: 'array',
          items: { type: 'string' },
          description: 'Skills required for this task',
        },
        budget_min: {
          type: 'number',
          description: 'Minimum budget in cents (min 500)',
        },
        budget_max: {
          type: 'number',
          description: 'Maximum budget in cents',
        },
        deadline: {
          type: 'string',
          description: 'ISO 8601 deadline for the task',
        },
        spots_available: {
          type: 'number',
          description: 'Number of spots available (default 1, max 500)',
        },
        pricing_mode: {
          type: 'string',
          enum: ['bid', 'fixed_per_spot'],
          description: 'Pricing mode (default bid)',
        },
        fixed_spot_amount: {
          type: 'number',
          description: 'Fixed amount in cents per spot (required when pricing_mode=fixed_per_spot)',
        },
        currency: {
          type: 'string',
          description: 'ISO-4217 uppercase currency code (default USD)',
        },
        preferred_payment_method: {
          type: 'string',
          enum: ['stripe', 'crypto'],
          description: 'Optional preferred payment rail for bookings created from this bounty',
        },
        proof_review_mode: {
          type: 'string',
          enum: ['manual', 'llm_assisted'],
          description: 'Proof review mode (default manual)',
        },
        proof_review_prompt: {
          type: 'string',
          description: 'Optional proof review prompt (only when proof_review_mode=llm_assisted)',
        },
      },
      required: ['title', 'description', 'skills_required', 'budget_min', 'budget_max'],
    },
  }),
  withReadOnly({
    name: 'list_bounties',
    description: 'List bounties with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'completed', 'cancelled'],
          description: 'Filter by bounty status',
        },
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by required skills',
        },
        budget_min: {
          type: 'number',
          description: 'Minimum budget filter in cents',
        },
        budget_max: {
          type: 'number',
          description: 'Maximum budget filter in cents',
        },
        currency: {
          type: 'string',
          description: 'Filter by ISO-4217 currency code',
        },
        pricing_mode: {
          type: 'string',
          enum: ['bid', 'fixed_per_spot'],
          description: 'Filter by pricing mode',
        },
        min_spots_remaining: {
          type: 'number',
          description: 'Only return bounties with at least this many open spots',
        },
        has_deadline: {
          type: 'boolean',
          description: 'Filter to bounties with deadlines',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
      },
    },
  }),
  withReadOnly({
    name: 'get_bounty',
    description: 'Get detailed information about a specific bounty including application count',
    inputSchema: {
      type: 'object',
      properties: {
        bounty_id: {
          type: 'string',
          description: 'The UUID of the bounty',
        },
      },
      required: ['bounty_id'],
    },
  }),
  withReadOnly({
    name: 'get_applications',
    description: 'Get all applications for a bounty you created',
    inputSchema: {
      type: 'object',
      properties: {
        bounty_id: {
          type: 'string',
          description: 'The UUID of the bounty',
        },
      },
      required: ['bounty_id'],
    },
  }),
  withDestructive({
    name: 'accept_application',
    description: 'Accept a human\'s application to your bounty. Creates a booking automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        bounty_id: {
          type: 'string',
          description: 'The UUID of the bounty',
        },
        application_id: {
          type: 'string',
          description: 'The UUID of the application to accept',
        },
      },
      required: ['bounty_id', 'application_id'],
    },
  }),
  withDestructive({
    name: 'reject_application',
    description: 'Reject a human\'s application to your bounty',
    inputSchema: {
      type: 'object',
      properties: {
        bounty_id: {
          type: 'string',
          description: 'The UUID of the bounty',
        },
        application_id: {
          type: 'string',
          description: 'The UUID of the application to reject',
        },
        reason: {
          type: 'string',
          description: 'Optional reason for rejection',
        },
      },
      required: ['bounty_id', 'application_id'],
    },
  }),

  // ============ BOOKINGS ============
  withDestructive({
    name: 'create_booking',
    description: 'Directly book a human for a task (bypassing the bounty system)',
    inputSchema: {
      type: 'object',
      properties: {
        human_id: {
          type: 'string',
          description: 'The UUID of the human to book',
        },
        title: {
          type: 'string',
          description: 'Task title',
        },
        description: {
          type: 'string',
          description: 'Task description',
        },
        amount: {
          type: 'integer',
          description: 'Amount to pay in cents',
          minimum: 1,
        },
        scheduled_start: {
          type: 'string',
          description: 'ISO 8601 start time',
        },
        estimated_hours: {
          type: 'number',
          description: 'Estimated hours for the task',
        },
      },
      required: ['human_id', 'title', 'description', 'amount'],
    },
  }),
  withIrreversibleWrite({
    name: 'fund_escrow',
    description: 'Fund the escrow for a booking. Stripe returns checkout_url, crypto returns Coinbase payment_link_url.',
    inputSchema: {
      type: 'object',
      properties: {
        booking_id: {
          type: 'string',
          description: 'The UUID of the booking to fund',
        },
        payment_method: {
          type: 'string',
          enum: ['stripe', 'crypto'],
          description: 'Payment method (default: stripe)',
        },
      },
      required: ['booking_id'],
    },
  }),
  withIrreversibleWrite({
    name: 'approve_work',
    description: 'Approve or reject submitted proof and release escrow payment',
    inputSchema: {
      type: 'object',
      properties: {
        booking_id: {
          type: 'string',
          description: 'The UUID of the booking',
        },
        proof_id: {
          type: 'string',
          description: 'The UUID of the proof submission',
        },
        approved: {
          type: 'boolean',
          description: 'Whether to approve (releases escrow) or reject',
        },
        feedback: {
          type: 'string',
          description: 'Optional feedback for the human',
        },
      },
      required: ['booking_id', 'proof_id', 'approved'],
    },
  }),

  // ============ REVIEWS ============
  withDestructive({
    name: 'submit_review',
    description: 'Submit a review for a completed booking',
    inputSchema: {
      type: 'object',
      properties: {
        booking_id: {
          type: 'string',
          description: 'The UUID of the booking',
        },
        rating: {
          type: 'number',
          description: 'Rating from 1-5 stars',
          minimum: 1,
          maximum: 5,
        },
        comment: {
          type: 'string',
          description: 'Review comment',
        },
      },
      required: ['booking_id', 'rating'],
    },
  }),

  // ============ FIELD CHECKS (EXTERNAL JOBS) ============
  withReadOnly({
    name: 'list_integration_providers',
    description: 'List external integration providers, capabilities, and configured environments for this ResearchAgent.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  }),
  withOpenWorldIrreversibleWrite({
    name: 'create_external_job',
    description: 'Create an external fulfillment job. Currently supports kind=field_check.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['field_check'],
          description: 'External job kind (currently field_check)',
        },
        title: {
          type: 'string',
          description: 'Optional short title for the external job',
        },
        instructions: {
          type: 'string',
          description: 'Instructions for the external provider/field agent',
        },
        address: {
          type: 'string',
          description: 'Address to visit (field_check)',
        },
        provider: {
          type: 'string',
          enum: ['proxypics', 'wegolook'],
          description: 'External provider (default: proxypics)',
        },
        provider_env: {
          type: 'string',
          enum: ['live', 'sandbox'],
          description: 'Provider environment (default: live)',
        },
        expires_at: {
          type: 'string',
          description: 'Optional ISO 8601 expiration timestamp',
        },
        scheduled_at: {
          type: 'string',
          description: 'Optional ISO 8601 scheduled timestamp',
        },
        public_only: {
          type: 'boolean',
          description: 'Public-only: do not enter property or trespass (default: true)',
        },
        auto_approve: {
          type: 'boolean',
          description: 'Auto-approve completed results when provider requires approval (default: true)',
        },
        template_token: {
          type: 'string',
          description: 'Optional provider template token (ProxyPics)',
        },
        tasks: {
          type: 'array',
          description: 'Optional list of task prompts (overrides provider template defaults when supported)',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['title', 'description'],
          },
        },
        price_boost_cents: {
          type: 'integer',
          description: 'Optional price boost in cents (ProxyPics)',
          minimum: 0,
        },
        unlimited_tasks: {
          type: 'boolean',
          description: 'Allow unlimited tasks (ProxyPics)',
        },
        unlimited_tasks_descriptions: {
          type: 'string',
          description: 'Unlimited tasks description text (requires unlimited_tasks=true)',
        },
        bounty_id: {
          type: 'string',
          description: 'Optional linked bounty UUID',
        },
        booking_id: {
          type: 'string',
          description: 'Optional linked booking UUID',
        },
        application_id: {
          type: 'string',
          description: 'Optional linked application UUID',
        },
        conversation_id: {
          type: 'string',
          description: 'Optional linked conversation UUID',
        },
      },
      required: ['kind', 'instructions', 'address'],
    },
  }),
  withOpenWorldRead({
    name: 'list_external_jobs',
    description: 'List recent external jobs you ordered.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['field_check'],
          description: 'Optional kind filter',
        },
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'action_required', 'completed', 'canceled', 'expired', 'failed'],
          description: 'Optional status filter',
        },
        provider: {
          type: 'string',
          enum: ['proxypics', 'wegolook'],
          description: 'Optional provider filter',
        },
        provider_env: {
          type: 'string',
          enum: ['live', 'sandbox'],
          description: 'Optional provider environment filter',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default 20, max 100)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
        bounty_id: {
          type: 'string',
          description: 'Optional linked bounty UUID filter',
        },
        booking_id: {
          type: 'string',
          description: 'Optional linked booking UUID filter',
        },
        application_id: {
          type: 'string',
          description: 'Optional linked application UUID filter',
        },
        conversation_id: {
          type: 'string',
          description: 'Optional linked conversation UUID filter',
        },
      },
    },
  }),
  withOpenWorldRead({
    name: 'get_external_job',
    description: 'Get an external job by id, including status and any recorded events.',
    inputSchema: {
      type: 'object',
      properties: {
        external_job_id: {
          type: 'string',
          description: 'The UUID of the external job',
        },
      },
      required: ['external_job_id'],
    },
  }),
  withOpenWorldWrite({
    name: 'refresh_external_job',
    description: 'Force-refresh an external job from the provider.',
    inputSchema: {
      type: 'object',
      properties: {
        external_job_id: {
          type: 'string',
          description: 'The UUID of the external job',
        },
      },
      required: ['external_job_id'],
    },
  }),
  withOpenWorldIrreversibleWrite({
    name: 'cancel_external_job',
    description: 'Cancel an external job with the external provider (if supported).',
    inputSchema: {
      type: 'object',
      properties: {
        external_job_id: {
          type: 'string',
          description: 'The UUID of the external job',
        },
      },
      required: ['external_job_id'],
    },
  }),
  withOpenWorldWrite({
    name: 'send_external_job_message',
    description: 'Send a message to the external provider/agent for an external job.',
    inputSchema: {
      type: 'object',
      properties: {
        external_job_id: {
          type: 'string',
          description: 'The UUID of the external job',
        },
        text: {
          type: 'string',
          description: 'Message text',
        },
      },
      required: ['external_job_id', 'text'],
    },
  }),
  withOpenWorldIrreversibleWrite({
    name: 'approve_external_job',
    description: 'Approve a completed external job if the provider requires explicit approval.',
    inputSchema: {
      type: 'object',
      properties: {
        external_job_id: {
          type: 'string',
          description: 'The UUID of the external job',
        },
      },
      required: ['external_job_id'],
    },
  }),
  withOpenWorldIrreversibleWrite({
    name: 'reject_external_job',
    description: 'Reject a completed external job and request corrections.',
    inputSchema: {
      type: 'object',
      properties: {
        external_job_id: {
          type: 'string',
          description: 'The UUID of the external job',
        },
        reason: {
          type: 'string',
          enum: [
            'unspecified',
            'blurry_photo',
            'wrong_direction',
            'incorrect_property',
            'people_in_photo',
            'property_not_visible',
            'other',
          ],
          description: 'Rejection reason',
        },
        clarification: {
          type: 'string',
          description: 'Required when reason=other',
        },
      },
      required: ['external_job_id', 'reason'],
    },
  }),
  withOpenWorldIrreversibleWrite({
    name: 'create_field_check',
    description: 'Order a field check (drive-by photos + report) via a configured external provider.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Optional short title for the field check',
        },
        instructions: {
          type: 'string',
          description: 'Instructions for the field agent (include what to verify and what photos you need)',
        },
        address: {
          type: 'string',
          description: 'Address to visit',
        },
        provider: {
          type: 'string',
          enum: ['proxypics', 'wegolook'],
          description: 'External provider (default: proxypics)',
        },
        provider_env: {
          type: 'string',
          enum: ['live', 'sandbox'],
          description: 'Provider environment (default: live)',
        },
        expires_at: {
          type: 'string',
          description: 'Optional ISO 8601 expiration timestamp',
        },
        scheduled_at: {
          type: 'string',
          description: 'Optional ISO 8601 scheduled timestamp',
        },
        public_only: {
          type: 'boolean',
          description: 'Public-only: do not enter property or trespass (default: true)',
        },
        auto_approve: {
          type: 'boolean',
          description: 'Auto-approve completed results when provider requires approval (default: true)',
        },
        template_token: {
          type: 'string',
          description: 'Optional provider template token (ProxyPics)',
        },
        tasks: {
          type: 'array',
          description: 'Optional list of task prompts (overrides provider template defaults when supported)',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['title', 'description'],
          },
        },
        price_boost_cents: {
          type: 'integer',
          description: 'Optional price boost in cents (ProxyPics)',
          minimum: 0,
        },
        unlimited_tasks: {
          type: 'boolean',
          description: 'Allow unlimited tasks (ProxyPics)',
        },
        unlimited_tasks_descriptions: {
          type: 'string',
          description: 'Unlimited tasks description text (requires unlimited_tasks=true)',
        },
        bounty_id: {
          type: 'string',
          description: 'Optional linked bounty UUID',
        },
        booking_id: {
          type: 'string',
          description: 'Optional linked booking UUID',
        },
        application_id: {
          type: 'string',
          description: 'Optional linked application UUID',
        },
        conversation_id: {
          type: 'string',
          description: 'Optional linked conversation UUID',
        },
      },
      required: ['instructions', 'address'],
    },
  }),
  withOpenWorldRead({
    name: 'list_field_checks',
    description: 'List recent field checks you ordered (external jobs).',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'action_required', 'completed', 'canceled', 'expired', 'failed'],
          description: 'Optional status filter',
        },
        provider: {
          type: 'string',
          enum: ['proxypics', 'wegolook'],
          description: 'Optional provider filter',
        },
        provider_env: {
          type: 'string',
          enum: ['live', 'sandbox'],
          description: 'Optional provider environment filter',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default 20, max 100)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
        bounty_id: {
          type: 'string',
          description: 'Optional linked bounty UUID filter',
        },
        booking_id: {
          type: 'string',
          description: 'Optional linked booking UUID filter',
        },
        application_id: {
          type: 'string',
          description: 'Optional linked application UUID filter',
        },
        conversation_id: {
          type: 'string',
          description: 'Optional linked conversation UUID filter',
        },
      },
    },
  }),
  withOpenWorldRead({
    name: 'get_field_check',
    description: 'Get a field check by id, including status and any recorded events.',
    inputSchema: {
      type: 'object',
      properties: {
        field_check_id: {
          type: 'string',
          description: 'The UUID of the field check (external job)',
        },
      },
      required: ['field_check_id'],
    },
  }),
  withOpenWorldWrite({
    name: 'refresh_field_check',
    description: 'Force-refresh a field check from the external provider (may trigger provider API calls).',
    inputSchema: {
      type: 'object',
      properties: {
        field_check_id: {
          type: 'string',
          description: 'The UUID of the field check (external job)',
        },
      },
      required: ['field_check_id'],
    },
  }),
  withOpenWorldIrreversibleWrite({
    name: 'cancel_field_check',
    description: 'Cancel a field check with the external provider (if supported).',
    inputSchema: {
      type: 'object',
      properties: {
        field_check_id: {
          type: 'string',
          description: 'The UUID of the field check (external job)',
        },
      },
      required: ['field_check_id'],
    },
  }),
  withOpenWorldWrite({
    name: 'send_field_check_message',
    description: 'Send a message to the field check provider/field agent (if supported).',
    inputSchema: {
      type: 'object',
      properties: {
        field_check_id: {
          type: 'string',
          description: 'The UUID of the field check (external job)',
        },
        text: {
          type: 'string',
          description: 'Message text',
        },
      },
      required: ['field_check_id', 'text'],
    },
  }),
  withOpenWorldIrreversibleWrite({
    name: 'approve_field_check',
    description: 'Approve a completed field check if the provider requires explicit approval.',
    inputSchema: {
      type: 'object',
      properties: {
        field_check_id: {
          type: 'string',
          description: 'The UUID of the field check (external job)',
        },
      },
      required: ['field_check_id'],
    },
  }),
  withOpenWorldIrreversibleWrite({
    name: 'reject_field_check',
    description: 'Reject a completed field check and request corrections (ProxyPics).',
    inputSchema: {
      type: 'object',
      properties: {
        field_check_id: {
          type: 'string',
          description: 'The UUID of the field check (external job)',
        },
        reason: {
          type: 'string',
          enum: [
            'unspecified',
            'blurry_photo',
            'wrong_direction',
            'incorrect_property',
            'people_in_photo',
            'property_not_visible',
            'other',
          ],
          description: 'Rejection reason',
        },
        clarification: {
          type: 'string',
          description: 'Required when reason=other',
        },
      },
      required: ['field_check_id', 'reason'],
    },
  }),

  // ============ NOTIFICATIONS ============
  withReadOnly({
    name: 'list_notifications',
    description: 'Get your notifications (applications, messages, payment events, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        unread_only: {
          type: 'boolean',
          description: 'Only return unread notifications (default: true)',
        },
        limit: {
          type: 'number',
          description: 'Maximum notifications to return (default 20, max 50)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by notification types (e.g., ["new_application", "new_message"])',
        },
      },
    },
  }),
  withDestructive({
    name: 'mark_notifications_read',
    description: 'Mark notifications as read',
    inputSchema: {
      type: 'object',
      properties: {
        notification_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'UUIDs of notifications to mark as read',
        },
        mark_all: {
          type: 'boolean',
          description: 'Mark all notifications as read (overrides notification_ids)',
        },
      },
    },
  }),
  withReadOnly({
    name: 'get_unread_count',
    description: 'Get the count of unread notifications',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  }),
  withReadOnly({
    name: 'list_notification_channels',
    description: 'List notification delivery channels configured for the authenticated ResearchAgent',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  }),
  withDestructive({
    name: 'create_notification_channel',
    description: 'Create a notification delivery channel (webhook/email/slack/discord)',
    inputSchema: {
      type: 'object',
      properties: {
        channel_type: {
          type: 'string',
          enum: ['webhook', 'email', 'slack', 'discord'],
          description: 'Delivery channel type',
        },
        channel_config: {
          type: 'object',
          description: 'Channel configuration object (shape depends on channel type)',
        },
        name: {
          type: 'string',
          description: 'Optional channel display name',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether this channel is enabled (default true)',
        },
      },
      required: ['channel_type', 'channel_config'],
    },
  }),
  withDestructive({
    name: 'update_notification_channel',
    description: 'Update an existing notification channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'Notification channel UUID',
        },
        channel_config: {
          type: 'object',
          description: 'Optional channel configuration updates',
        },
        name: {
          type: 'string',
          description: 'Optional display name update',
        },
        enabled: {
          type: 'boolean',
          description: 'Enable or disable the channel',
        },
      },
      required: ['channel_id'],
    },
  }),
  withIrreversibleWrite({
    name: 'delete_notification_channel',
    description: 'Delete a notification channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'Notification channel UUID',
        },
      },
      required: ['channel_id'],
    },
  }),
  withDestructive({
    name: 'test_notification_channel',
    description: 'Send a test notification to a channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'Notification channel UUID',
        },
      },
      required: ['channel_id'],
    },
  }),

  // ============ TALENT CONNECTORS ============
  withReadOnly({
    name: 'list_talent_connectors',
    description: 'List available talent network connectors with their status, capabilities, and configured credentials',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  }),
  withOpenWorldWrite({
    name: 'test_talent_connector',
    description: 'Test the connection to a talent network provider',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Talent provider (upwork, thumbtack, taskrabbit, fiverr)' },
        env: { type: 'string', description: 'Environment (live or sandbox)', default: 'live' },
      },
      required: ['provider'],
    },
  }),
  withOpenWorldRead({
    name: 'search_connector_workers',
    description: 'Search for workers on a talent network',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Talent provider' },
        env: { type: 'string', description: 'Environment (live or sandbox)', default: 'live' },
        q: { type: 'string', description: 'Search query' },
        skills: { type: 'string', description: 'Comma-separated skills filter' },
        location: { type: 'string', description: 'Location filter' },
        limit: { type: 'number', description: 'Max results (default 20, max 100)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
      required: ['provider', 'q'],
    },
  }),
  withDestructive({
    name: 'create_connector_match',
    description: 'Create a match linking a talent connector worker to a bounty, booking, or conversation',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Talent provider' },
        env: { type: 'string', description: 'Environment (live or sandbox)', default: 'live' },
        worker_id: { type: 'string', description: 'UUID of cached talent_connector_workers row' },
        bounty_id: { type: 'string', description: 'Optional bounty to link' },
        booking_id: { type: 'string', description: 'Optional booking to link' },
        conversation_id: { type: 'string', description: 'Optional conversation to link' },
        match_reason: { type: 'string', description: 'Why this worker was matched' },
      },
      required: ['provider', 'worker_id'],
    },
  }),
  withReadOnly({
    name: 'list_connector_matches',
    description: 'List talent connector matches for the current agent',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Filter by provider' },
        status: { type: 'string', description: 'Filter by status (pending, contacted, accepted, rejected, expired)' },
        bounty_id: { type: 'string', description: 'Filter by bounty' },
        booking_id: { type: 'string', description: 'Filter by booking' },
        limit: { type: 'number', description: 'Max results (default 20, max 100)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  }),
  withOpenWorldWrite({
    name: 'contact_connector_worker',
    description: 'Contact a worker on a talent network (requires idempotency key)',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Talent provider' },
        env: { type: 'string', description: 'Environment (live or sandbox)', default: 'live' },
        idempotency_key: { type: 'string', description: 'Unique key to prevent duplicate actions' },
        provider_worker_id: { type: 'string', description: 'Provider-side worker ID' },
        message: { type: 'string', description: 'Message to send to the worker' },
        match_id: { type: 'string', description: 'Optional match to link' },
        worker_id: { type: 'string', description: 'Optional cached worker UUID' },
      },
      required: ['provider', 'idempotency_key', 'provider_worker_id', 'message'],
    },
  }),
  withOpenWorldWrite({
    name: 'post_connector_task',
    description: 'Post a task or booking request to a talent network worker (requires idempotency key)',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Talent provider' },
        env: { type: 'string', description: 'Environment (live or sandbox)', default: 'live' },
        idempotency_key: { type: 'string', description: 'Unique key to prevent duplicate actions' },
        provider_worker_id: { type: 'string', description: 'Provider-side worker ID' },
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        budget_cents: { type: 'number', description: 'Budget in cents' },
        match_id: { type: 'string', description: 'Optional match to link' },
        worker_id: { type: 'string', description: 'Optional cached worker UUID' },
      },
      required: ['provider', 'idempotency_key', 'provider_worker_id', 'title', 'description'],
    },
  }),
  withOpenWorldWrite({
    name: 'sync_connector_action',
    description: 'Sync/refresh worker data from a talent network (requires idempotency key)',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Talent provider' },
        env: { type: 'string', description: 'Environment (live or sandbox)', default: 'live' },
        idempotency_key: { type: 'string', description: 'Unique key to prevent duplicate actions' },
        provider_worker_id: { type: 'string', description: 'Provider-side worker ID to sync' },
        match_id: { type: 'string', description: 'Optional match to link' },
        worker_id: { type: 'string', description: 'Optional cached worker UUID' },
      },
      required: ['provider', 'idempotency_key'],
    },
  }),
]

export const MCP_TOOLS: Tool[] = MCP_TOOL_DEFINITIONS.map((tool) => tool.tool)

export const MCP_TOOL_BY_NAME = new Map<string, McpToolDefinition>(
  MCP_TOOL_DEFINITIONS.map((tool) => [tool.tool.name, tool])
)
