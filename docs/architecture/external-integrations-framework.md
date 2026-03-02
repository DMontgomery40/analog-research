# External Integrations Framework

## Goal

Make external fulfillment integrations first-class and scalable across many providers while preserving backward compatibility for existing field-check APIs and MCP tools.

## Scope

Current runtime scope is external jobs (`kind=field_check`) with provider plugins.

## Core Design

### 1. Provider plugin registry

Location:

- `apps/web/src/lib/external-jobs/providers/registry.ts`
- `apps/web/src/lib/external-jobs/providers/types.ts`

Each provider plugin defines:

- descriptor metadata (`displayName`, `status`, `supportedEnvs`)
- capability matrix
- credential field schema hints
- runtime operation handlers

### 2. Provider descriptors as product contract

Provider descriptors drive:

- dashboard provider catalog (`GET /api/v1/integrations/providers`)
- capability visibility in UI
- staged rollout (`active` vs `planned`)

### 3. Runtime operations

Service layer routes provider actions via plugin interface instead of hardcoded branching:

- create field check
- refresh snapshot/status
- cancel
- approve/reject
- send message
- list templates

ProxyPics is active; WeGoLook is scaffolded and marked planned.

## Data Model

### External jobs core

`external_jobs` stores canonical lifecycle state.

### Linked records

`external_jobs` now supports optional linkage to marketplace entities:

- `bounty_id`
- `booking_id`
- `application_id`
- `conversation_id`

DB trigger `validate_external_job_links` enforces same-researchagent ownership and cross-link consistency.

## API Surface

Backward-compatible v1 is preserved.

### Existing endpoints retained

- `/api/v1/integrations`
- `/api/v1/integrations/{provider}`
- `/api/v1/integrations/{provider}/test`
- `/api/v1/integrations/{provider}/verified`
- `/api/v1/external-jobs`
- `/api/v1/external-jobs/{id}` and action routes

### Added endpoint

- `GET /api/v1/integrations/providers`

Returns provider descriptors plus configured env status per ResearchAgent.

### Extended payloads

`POST /api/v1/external-jobs` accepts optional link fields:

- `bounty_id`
- `booking_id`
- `application_id`
- `conversation_id`

`GET /api/v1/external-jobs` supports corresponding filters.

`PUT /api/v1/integrations/{provider}` accepts provider-shaped credential updates:

- preferred: `credentials: { ... }` keyed by provider descriptor credential field names
- backward-compatible: legacy `api_key` accepted for older clients
- env selection remains `live|sandbox`

Credential parsing/normalization lives in:

- `apps/web/src/lib/integrations/credentials.ts`

Provider plugins validate final credential objects before encryption/persistence.

## Safety and Failure Behavior

### Schema parity guard

Routes that rely on integration/autopilot tables now run runtime parity probes.

If required tables are unavailable:

- return `503`
- return machine-readable code `SCHEMA_PARITY_UNAVAILABLE`
- include remediation metadata and missing table names

### Idempotency and audit

Existing webhook idempotency and event timelines remain unchanged.

## UI Integration

### Settings

External Integrations UI now renders provider catalog cards from registry metadata (not a single hardcoded provider card).

Credential forms are descriptor-driven per provider and environment:

- dynamic field rendering from `credentialFields`
- per-provider save/test controls
- capability-aware button behavior (`test_connection`)
- safe masked display per configured env

### Bounty detail

Owners can order and view linked field checks directly from bounty detail.

### Booking detail

Linked field checks are visible from booking detail.

### Field checks dashboard

Field check ordering now resolves provider choices from configured provider catalog rows (active + configured + capability-enabled), not a hardcoded provider id.

## Adding a New Provider

1. Add plugin implementation in `apps/web/src/lib/external-jobs/providers/`.
2. Register plugin in `registry.ts` and descriptor metadata.
3. Implement capability handlers incrementally.
4. Expose provider verification path (`/api/v1/integrations/{provider}/verified`) and wire it to real provider credentials/API checks.
5. Keep `/test` compatibility route wired to the same verification logic.
6. Add route + lib tests for descriptor and runtime behavior.
7. Update OpenAPI and docs parity artifacts.
8. Add/update `.codex` memory entries for decisions and gotchas.

## Interop Alignment Notes

Design choices are intentionally aligned with established agent ecosystems:

- RentAHuman MCP pattern (https://rentahuman.ai/mcp):
  - action-oriented tools with explicit read/write distinctions
  - practical aliases for common workflows
  - clear separation between discovery operations and mutating operations
- OpenClaw platform pattern (https://docs.openclaw.ai/):
  - extensible plugin/gateway mindset over one-off hardcoded integrations
  - multi-agent safe routing assumptions
  - operational emphasis on explicit control surfaces and observability
  - specifically aligned with:
    - https://docs.openclaw.ai/plugins/agent-tools
    - https://docs.openclaw.ai/tools/plugin

Current MCP surface therefore keeps field-check aliases for compatibility while also adding generic external-job aliases for scalability.

## Raised-Hand Talent Connector Policy

External worker-network integrations must follow one product invariant:

- Connect to workers who already opted in on those platforms.
- Do not rely on cold outreach, scraping, or off-platform contact extraction.

### Connector onboarding stages

- `live`: production connector available in Analog Research workflows.
- `partner_onboarding`: official API path exists, but partner/legal onboarding is required.
- `researching`: official API/program is still being validated for policy-safe integration.

### Current connector map (2026-02-11 snapshot)

- Analog Research Marketplace: `live`
- Upwork: `partner_onboarding`
- Thumbtack: `partner_onboarding`
- Taskrabbit: `partner_onboarding`
- Fiverr: `researching`

### Source references used for this snapshot

- OpenClaw tools + plugin docs:
  - https://docs.openclaw.ai/tools/agent-send
  - https://docs.openclaw.ai/plugins/agent-tools
  - https://docs.openclaw.ai/tools/plugin
- RentAHuman MCP/API surfaces:
  - https://rentahuman.ai/mcp
  - https://rentahuman.ai/for-agents
  - https://rentahuman.ai/blog/mcp-integration-guide
- Marketplace developer docs:
  - Upwork GraphQL docs: https://www.upwork.com/developer/documentation/graphql/api/docs/index.html
  - Thumbtack partner docs: https://developers.thumbtack.com/docs/overview
  - Taskrabbit API docs: https://developer.taskrabbit.com/docs/overview-taskrabbit-home-services-api
  - Fiverr developer portal: https://developers.fiverr.com/ (waitlist/developer ecosystem status)
