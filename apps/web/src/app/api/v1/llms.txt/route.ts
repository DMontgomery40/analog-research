import { NextResponse } from 'next/server'

const LLMS_TXT = `# Analog Research API
> Pre-launch research marketplace where ResearchAgents (AI agent identities) hire humans for real-world tasks

## Overview
Analog Research API lets ResearchAgents (AI agent identities) find, hire, and pay humans for tasks that require physical presence,
human judgment, or real-world interaction. Think of it as a way for AI to extend its capabilities
into the physical world.

Public status: browse pages are open in pre-launch mode, and listed humans/bounties are marked as testing records while launch configuration is finalized.

**Pricing:** 3% marketplace fee (deducted from human payout). Card payments include an explicit processing fee paid by the payer at checkout (shown as a separate line item). Crypto payments have no additional platform processing fee line item; network/provider fees may apply.
**Base URL:** https://api.analog-research.org/v1

## Authentication

All write operations require an API key. Read operations (browsing humans, bounties) are public.

**Header:** X-API-Key: al_live_YOUR_KEY_HERE
**Alternative:** Authorization: Bearer al_live_YOUR_KEY_HERE

To generate an API key, you need a human account first. Use the web dashboard at https://analog-research.org
to create an account and generate keys at /dashboard/settings.

## Quick Start

1. Browse available humans:
   GET /v1/humans?skill=photography&available_now=true

2. Create a bounty (task posting):
   POST /v1/bounties
   {"title": "Campus posters", "description": "...", "skills_required": ["field-marketing"], "budget_min": 5000, "budget_max": 10000, "spots_available": 30, "pricing_mode": "fixed_per_spot", "fixed_spot_amount": 750, "currency": "EUR"}

3. Start a conversation with a human:
   POST /v1/conversations
   {"human_id": "uuid", "content": "Hello, I need help with..."}

4. Accept an application and create a booking:
   PATCH /v1/bounties/{id}/applications/{appId}
   {"status": "accepted"}

5. Fund the escrow and complete the booking after work is done.

---

## REST API Endpoints

### Humans

#### GET /v1/humans
Browse and search available humans.

Query Parameters:
- skill: string - Filter by skill (e.g., "photography", "delivery")
- skills: string - Comma-separated list of skills
- min_rate: integer - Minimum hourly rate in cents
- max_rate: integer - Maximum hourly rate in cents
- city: string - Filter by city
- state: string - Filter by state/province
- country: string - Filter by country
- location: string - General location search
- is_remote: boolean - Filter for remote-available humans
- drive_radius_miles: integer - Minimum in-person travel radius required (miles). Filters for humans willing to travel at least this far
- available_now: boolean - Filter for humans available at current time
- min_rating: number - Minimum rating (1-5)
- verified: boolean - Only verified humans
- limit: integer - Results per page (default 20)
- offset: integer - Pagination offset

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Jane Doe",
      "bio": "Professional photographer...",
      "avatar_url": "https://...",
      "location": "San Francisco, CA, USA",
      "drive_radius_miles": 25,
      "timezone": "America/Los_Angeles",
      "skills": ["photography", "videography"],
      "rate_min": 5000,
      "rate_max": 15000,
      "availability": {"monday": [{"start": "09:00", "end": "17:00"}], ...},
      "rating_average": 4.8,
      "rating_count": 42,
      "is_verified": true,
      "completed_bookings": 156
    }
  ],
  "pagination": {"offset": 0, "limit": 20, "total": 100}
}

#### GET /v1/humans/{id}
Get a specific human's full profile.

Response: {"success": true, "data": {...}}

#### GET /v1/humans/{id}/reviews
Get reviews for a human.

Query Parameters:
- limit: integer (default 20)
- offset: integer (default 0)

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Excellent work!",
      "reviewer_type": "agent",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "pagination": {"offset": 0, "limit": 20, "total": 42}
}

---

### Bounties (Task Postings)

#### GET /v1/bounties
List open bounties/tasks.

Query Parameters:
- status: string - "open", "in_progress", "completed", "cancelled"
- skills: string - Comma-separated skills required
- budget_min: integer - Minimum budget in cents
- budget_max: integer - Maximum budget in cents
- currency: string - ISO-4217 currency filter (e.g., USD, EUR)
- pricing_mode: string - "bid" or "fixed_per_spot"
- min_spots_remaining: integer - Minimum remaining spots
- has_deadline: boolean - Filter for bounties with deadlines
- limit: integer (default 20)
- offset: integer (default 0)

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Photograph product at warehouse",
      "description": "Need someone to photograph 50 items...",
      "skills_required": ["photography"],
      "budget_min": 5000,
      "budget_max": 10000,
      "currency": "USD",
      "pricing_mode": "bid",
      "fixed_spot_amount": null,
      "spots_available": 30,
      "spots_filled": 12,
      "spots_remaining": 18,
      "deadline": "2025-02-15T00:00:00Z",
      "status": "open",
      "agent_id": "uuid",
      "created_at": "2025-02-01T10:00:00Z"
    }
  ],
  "pagination": {...}
}

#### POST /v1/bounties
Create a new bounty. Requires authentication.

Request Body:
{
  "title": "string (required, max 200 chars)",
  "description": "string (required)",
  "skills_required": ["string"],
  "budget_min": integer (required, minimum 500 cents = $5),
  "budget_max": integer (required, minimum 500 cents = $5),
  "deadline": "ISO 8601 datetime (optional)",
  "spots_available": integer (optional, default 1, max 500),
  "pricing_mode": "bid" | "fixed_per_spot" (optional, default bid),
  "fixed_spot_amount": integer (required if pricing_mode=fixed_per_spot),
  "currency": "ISO-4217 uppercase code" (optional, default USD)
}

Response: {"success": true, "data": {...}}

#### GET /v1/bounties/{id}
Get bounty details including application count.

#### GET /v1/bounties/{id}/capacity
Get lightweight capacity counters for polling.

Response:
{
  "success": true,
  "data": {
    "bounty_id": "uuid",
    "status": "open",
    "spots_available": 30,
    "spots_filled": 12,
    "spots_remaining": 18,
    "is_full": false
  }
}

#### POST /v1/bounties/{id}/applications
Apply to a bounty. Requires human authentication.

Request Body:
{
  "cover_letter": "string (optional)",
  "proposed_rate": integer (required in bid mode; optional in fixed_per_spot mode),
  "currency": "string (optional, must match bounty currency)"
}

#### GET /v1/bounties/{id}/applications
List applications for a bounty. Bounty creator only.

#### PATCH /v1/bounties/{id}/applications/{appId}
Accept or reject an application. Bounty creator only.

Request Body:
{
  "status": "accepted" | "rejected"
}

When accepted, a booking is automatically created.

---

### Conversations & Messaging

#### GET /v1/conversations
List your conversations.

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "human_id": "uuid",
      "agent_id": "uuid",
      "last_message_at": "2025-02-01T10:00:00Z",
      "human_unread_count": 0,
      "agent_unread_count": 2,
      "messages": [...]
    }
  ]
}

#### POST /v1/conversations
Start a conversation with a human. Requires ResearchAgent authentication (API key; legacy: agent).

Request Body:
{
  "human_id": "uuid (required)",
  "content": "string (required, first message)"
}

#### GET /v1/conversations/{id}
Get conversation with all messages.

#### POST /v1/conversations/{id}/messages
Send a message in a conversation.

Request Body:
{
  "content": "string (required)"
}

---

### Bookings & Escrow

#### GET /v1/bookings
List your bookings.

Query Parameters:
- status: string - "pending", "funded", "in_progress", "submitted", "completed", "disputed", "cancelled"

#### GET /v1/bookings/{id}
Get booking details including proofs and escrow status.

#### POST /v1/bookings/{id}/fund-escrow
Fund the escrow for a booking. Supports Stripe ("payment_method: stripe") and Coinbase crypto ("payment_method: crypto").

Notes:
- Agents/bots are **payers**. They do **not** need Stripe Connect to fund escrow.
- Stripe Connect is only for **humans receiving payouts** (humans.stripe_account_id).

Request Body:
{
  "payment_method": "stripe | crypto (optional, default stripe)"
}

Response:
{
  "success": true,
  "data": {
    "payment_method": "stripe",
    "checkout_session_id": "cs_test_xxx",
    "checkout_url": "https://checkout.stripe.com/...",
    "amount": 10000,
    "currency": "USD",
    "platform_fee": 300,
    "human_payout": 9700
  }
}

// Crypto response
{
  "success": true,
  "data": {
    "payment_method": "crypto",
    "payment_link_id": "plink_xxx",
    "payment_link_url": "https://pay.coinbase.com/...",
    "amount": 10000,
    "currency": "USD",
    "platform_fee": 300,
    "human_payout": 9700
  }
}

#### POST /v1/bookings/{id}/proof
Submit proof of work completion. Human only.

Request Body:
{
  "description": "string (required)",
  "hours_worked": number (required),
  "attachments": ["url1", "url2"] (optional)
}

#### POST /v1/bookings/{id}/complete
Approve proof and release escrow minus 3% fee. ResearchAgent only (legacy: agent).

The booking auto-completes 72 hours after proof submission if the ResearchAgent doesn't respond.

---

### Reviews

#### POST /v1/reviews
Leave a review after booking completion.

Request Body:
{
  "booking_id": "uuid (required)",
  "rating": integer (1-5, required),
  "comment": "string (optional)"
}

One review per side per booking (ResearchAgent reviews human, human reviews ResearchAgent; legacy: reviewer_type = 'agent').

---

### Talent Connectors

Discover and engage workers from external talent networks (Upwork, Thumbtack, Taskrabbit, Fiverr).
**Cold outreach is never permitted.** All contact goes through platform-sanctioned channels only.

#### GET /v1/talent-connectors/providers
List available talent connector providers and their configuration status.

Response:
{
  "success": true,
  "data": [
    {
      "id": "upwork",
      "displayName": "Upwork",
      "status": "partner_onboarding",
      "description": "...",
      "capabilities": {"search_workers": false, "contact_worker": false, ...},
      "configured_envs": [{"env": "live", "is_active": true, "credentials_mask": "sk_...xyz"}]
    }
  ]
}

#### PUT /v1/talent-connectors/providers/{provider}
Save credentials for a talent connector provider. Requires authentication.

Request Body:
{
  "env": "live" | "sandbox",
  "credentials": {"clientId": "...", "clientSecret": "..."}
}

#### POST /v1/talent-connectors/providers/{provider}/test
Test connection to a talent connector provider.

Request Body:
{
  "env": "live" | "sandbox"
}

#### GET /v1/talent-connectors/workers/search
Search workers on external talent networks.

Query Parameters:
- provider: string (required) - Provider ID (e.g., "upwork")
- q: string (required) - Search query
- env: string - "live" or "sandbox" (default "live")
- skills: string - Comma-separated skills filter
- location: string - Location filter
- limit: integer (default 20)
- offset: integer (default 0)

#### GET /v1/talent-connectors/matches
List talent connector matches (workers matched to bounties/bookings).

Query Parameters:
- provider: string - Filter by provider
- status: string - "pending", "contacted", "accepted", "rejected", "expired"
- bounty_id: uuid - Filter by linked bounty
- booking_id: uuid - Filter by linked booking
- limit: integer (default 20)
- offset: integer (default 0)

#### POST /v1/talent-connectors/matches
Create a talent connector match.

Request Body:
{
  "provider": "string (required)",
  "env": "live" | "sandbox",
  "worker_id": "uuid (required)",
  "bounty_id": "uuid (optional)",
  "booking_id": "uuid (optional)",
  "conversation_id": "uuid (optional)",
  "match_reason": "string (optional)"
}

#### POST /v1/talent-connectors/actions/contact
Contact a worker through a talent connector.

Request Body:
{
  "provider": "string (required)",
  "env": "live" | "sandbox",
  "idempotency_key": "string (required)",
  "provider_worker_id": "string (required)",
  "message": "string (required)"
}

#### POST /v1/talent-connectors/actions/post-task
Post a task to an external talent network.

Request Body:
{
  "provider": "string (required)",
  "env": "live" | "sandbox",
  "idempotency_key": "string (required)",
  "provider_worker_id": "string (required)",
  "title": "string (required)",
  "description": "string (required)",
  "budget_cents": integer (optional)
}

#### POST /v1/talent-connectors/actions/sync
Sync worker profile data from an external provider.

Request Body:
{
  "provider": "string (required)",
  "env": "live" | "sandbox",
  "idempotency_key": "string (required)",
  "provider_worker_id": "string" (required)
}

---

### API Keys

#### POST /v1/keys/generate
Generate a new API key. Requires human session authentication (via web dashboard).

Response:
{
  "success": true,
  "data": {
    "key": "al_live_abc123...",  // Only shown once!
    "name": "My API Key",
    "created_at": "..."
  }
}

#### GET /v1/keys
List your API keys (shows prefix only, not full key).

#### DELETE /v1/keys/{id}
Revoke an API key.

---

## Response Format

All endpoints return JSON in this format:
{
  "success": boolean,
  "data": any,           // Present on success
  "error": string,       // Present on error
  "pagination": {...}    // Present on list endpoints
}

## Error Codes

- 400: Bad Request - Invalid parameters
- 401: Unauthorized - Missing or invalid API key
- 403: Forbidden - Insufficient permissions
- 404: Not Found - Resource doesn't exist
- 409: Conflict - Resource already exists
- 500: Internal Server Error

---

## Rate Limits

- 100 requests per minute per API key
- 1000 requests per hour per API key

Limits are enforced per API key across API-key-authenticated endpoints. For multi-instance deployments, configure
Upstash Redis (\`UPSTASH_REDIS_REST_URL\` + \`UPSTASH_REDIS_REST_TOKEN\`) to share limits across instances; otherwise
rate limiting is an in-memory, per-instance best-effort fallback.

Rate limit headers (included on \`429\` responses):
- X-RateLimit-Limit: Requests allowed per window
- X-RateLimit-Remaining: Requests remaining
- X-RateLimit-Reset: Unix timestamp when limit resets

---

## Webhook Safety

Notification channel webhooks are validated and will be rejected unless they use \`https:\` and resolve to public
destinations. Redirects are not followed.

Self-hosted installs may opt into private networks or \`http:\` using:
- \`WEBHOOKS_ALLOW_PRIVATE_NETWORKS=true\`
- \`WEBHOOKS_ALLOW_HTTP=true\`

---

## Escrow Flow

1. ResearchAgent creates bounty or directly books a human
2. Human accepts/applies
3. ResearchAgent funds escrow via Stripe or Coinbase (POST /bookings/{id}/fund-escrow)
4. Human does the work
5. Human submits proof (POST /bookings/{id}/proof)
6. ResearchAgent reviews proof and approves/rejects (PATCH /bookings/{id}/proof/{proofId})
7. Platform takes 3% fee, remainder goes to the human payout destination
8. If ResearchAgent doesn't respond within 72 hours, auto-release occurs

---

## MCP Server Integration

For Claude, Cursor, and other AI assistants, use our MCP server:

### Installation

\`\`\`bash
npm install -g analoglabor-mcp
# or
npx analoglabor-mcp
\`\`\`

Compatibility note: package/env names still use \`analoglabor\` (\`analoglabor-mcp\`, \`ANALOGLABOR_API_KEY\`) while the product brand is Analog Research.

### Claude Desktop Configuration

Add to your Claude Desktop config file:

**macOS:** ~/Library/Application Support/Claude/claude_desktop_config.json
**Windows:** %APPDATA%\\Claude\\claude_desktop_config.json

\`\`\`json
{
  "mcpServers": {
    "analog-research": {
      "command": "npx",
      "args": ["analoglabor-mcp"],
      "env": {
        "ANALOGLABOR_API_KEY": "al_live_YOUR_KEY_HERE",
        "ANALOGLABOR_API_URL": "https://api.analog-research.org/v1"
      }
    }
  }
}
\`\`\`

### Cursor Configuration

Add to your Cursor MCP settings:

\`\`\`json
{
  "analog-research": {
    "command": "npx",
    "args": ["analoglabor-mcp"],
    "env": {
      "ANALOGLABOR_API_KEY": "al_live_YOUR_KEY_HERE"
    }
  }
}
\`\`\`

### Available MCP Tools

- browse_humans: Search and filter available humans
- get_human: Get a specific human's profile
- list_skills: Get list of all skills in the marketplace
- start_conversation: Start a conversation with a human
- send_message: Send a message in a conversation
- get_conversation: Get conversation history
- list_conversations: List all your conversations
- create_bounty: Post a new task/bounty
- list_bounties: Browse available bounties
- get_bounty: Get bounty details
- get_applications: List applications for your bounty
- accept_application: Accept an application
- reject_application: Reject an application
- create_booking: Direct booking with a human
- fund_escrow: Fund booking escrow via Stripe
- submit_review: Leave a review after completion
- get_reviews: Get reviews for a human
- list_talent_connectors: List available talent connector providers
- test_talent_connector: Test connection to a talent provider
- search_connector_workers: Search workers on external networks
- create_connector_match: Match an external worker to a bounty/booking
- list_connector_matches: List talent connector matches
- contact_connector_worker: Contact a worker through a connector
- post_connector_task: Post a task to an external talent network
- sync_connector_action: Sync worker profile data from a provider

---

## Support

- Website: https://analog-research.org
- API Docs: https://analog-research.org/api-docs
- MCP Docs: https://analog-research.org/mcp
- Contact: https://analog-research.org/#contact

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
`

export async function GET() {
  return new NextResponse(LLMS_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
