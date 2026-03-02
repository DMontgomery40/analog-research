# Raised-Hand Marketplace Connectors (Landing + Policy Lock)

Date: 2026-02-11  
Owner: Codex

## Why this note exists

Product direction was clarified in plain terms:

- We should not present external integrations as a fragile “differentiator” claim.
- We should make connector capability obvious in top-level UI (landing + top nav).
- Most important: **no cold recruiting**. We only connect to workers who already raised their hand on a marketplace/network.

This note locks the framing + current research snapshot so future work stays aligned.

## Product invariant (new hard rule)

For external worker networks:

- Allowed: opt-in profiles, partner APIs, explicit account linking, on-platform messaging/payment pathways.
- Not allowed: scraping for contacts, cold outreach workflows, off-platform extraction of user contact info from source marketplaces.

Implementation reflection:

- `apps/web/src/lib/integrations/marketplace-connectors.ts` encodes `supportsColdOutreach: false` for every connector.
- Test guard added in `tests/web/lib/integrations/marketplace-connectors.test.ts`.

## UI integration changes in this phase

- Added top-visible nav jump link:
  - `apps/web/src/components/public-nav.tsx`
  - New item: `Talent Networks` → `/#talent-networks`
- Added landing section with explicit “Raised-Hand Talent Networks” framing:
  - `apps/web/src/app/page.tsx`
  - Includes integration-path + worker-signal cards.
- Source-of-truth connector matrix added:
  - `apps/web/src/lib/integrations/marketplace-connectors.ts`

## Connector status matrix (2026-02-11 snapshot)

### Live

- Analog Research Marketplace
  - Status: `live`
  - Path: REST API + MCP
  - Signal: Humans explicitly publish profile/skills/rates/availability.

### Partner onboarding

- Upwork
  - Status: `partner_onboarding`
  - Path: GraphQL + OAuth2 + API key/tenant context.
  - Notes: official GraphQL docs available; commercial usage has partnership constraints.
- Thumbtack
  - Status: `partner_onboarding`
  - Path: partner API with access request + OAuth2.
  - Notes: docs show request/negotiation/messaging APIs; onboarding is access-controlled.
- Taskrabbit
  - Status: `partner_onboarding`
  - Path: Partner Platform API.
  - Notes: business-partner credential path; docs include booking lifecycle endpoints.

### Researching

- Fiverr
  - Status: `researching`
  - Path: developer ecosystem/waitlist validation in progress.
  - Notes: no confirmed open, self-serve marketplace hiring API contract finalized for our use case in this phase.

## External reference alignment used in this phase

### OpenClaw and RentAHuman (integration pattern grounding)

- https://docs.openclaw.ai/tools/agent-send
- https://docs.openclaw.ai/plugins/agent-tools
- https://docs.openclaw.ai/tools/plugin
- https://rentahuman.ai/mcp
- https://rentahuman.ai/for-agents
- https://rentahuman.ai/blog/mcp-integration-guide

Pattern extracted:

- Action-oriented tool surfaces with explicit read vs write boundaries.
- Plugin/descriptor-driven extension over one-off hardcoding.
- Integration docs should be machine-readable and auditable.

### Marketplace/provider docs used for connector statuses

- Upwork GraphQL docs: https://www.upwork.com/developer/documentation/graphql/api/docs/index.html
- Thumbtack partner docs: https://developers.thumbtack.com/docs/overview
- Taskrabbit API docs: https://developer.taskrabbit.com/docs/overview-taskrabbit-home-services-api
- Fiverr developer portal: https://developers.fiverr.com/

## OpenAI/Codex subagent workflow update captured

Used OpenAI developer docs MCP to avoid stale assumptions:

- Codex App Server thread source kinds include explicit subagent categories:
  - `subAgent`, `subAgentReview`, `subAgentCompact`, `subAgentThreadSpawn`, `subAgentOther`
  - Source: https://developers.openai.com/codex/app-server/#list-threads-with-pagination--filters
- Codex multi-agent workflow guidance emphasizes:
  - MCP server orchestration
  - hand-offs with guardrails
  - traceability/auditability of each agent step
  - Source: https://developers.openai.com/codex/guides/agents-sdk/#creating-multi-agent-workflows

## Implementation completed (2026-02-11)

The full raised-hand talent connector infrastructure is now built:

### DB (4 migrations: 032–035)
- `talent_connector_workers` — cached worker profiles with RLS
- `talent_connector_matches` — links workers to bounties/bookings/conversations
- `talent_connector_actions` — append-only audit log with idempotency
- `talent_connector_policies` — per-agent per-provider policy flags
- Cross-agent ownership validation trigger on matches

### Service layer (`apps/web/src/lib/talent-connectors/`)
- `types.ts` — providers, statuses, error codes
- `providers/types.ts` — plugin interface with `supportsColdOutreach: false` literal
- `providers/registry.ts` — plugin registry
- `providers/{upwork,thumbtack,taskrabbit,fiverr}.ts` — stub plugins
- `policy.ts` — gate formula: global flag → researching → partner contract → credentials → policy flags → capability
- `service.ts` — CRUD + search + action execution with error handling
- `http.ts` — shared auth + schema parity guard for API routes

### API routes (9 endpoints under `/api/v1/talent-connectors/`)
- `providers/` — GET list, PUT credentials, POST test
- `workers/search` — GET search
- `matches/` — GET list, POST create
- `actions/{contact,post-task,sync}` — POST actions

### MCP tools (8 tools across 3 files)
- tools.ts, dispatcher.ts, index.ts

### UI
- Settings page: "Talent Connectors" section with credential management + test
- Bounty detail: linked talent matches section

### Tests (21 tests across 3 files)
- Registry: provider registration, cold outreach invariant, credential validation
- Policy: gate formula exhaustive coverage
- MCP: tool definitions, permissions, dispatcher routing

### Follow-up when partner APIs go live
- Implement plugin `searchWorkers`, `contactWorker`, `createTaskOrBooking`, `syncObject` methods
- Flip descriptor capabilities to `true` and status to `active`
- Run `pnpm db:push` with migrations 032–035
