# External Integrations: Schema Parity + Provider Framework + Linked Jobs

Date: 2026-02-11
Owner: Codex

## Why this was needed

Production/dashboard failures showed raw PostgREST schema-cache errors for tables that code expected:

- `external_integrations`
- `external_jobs`
- `agent_autopilot_audit_log`

This exposed two issues simultaneously:

1. Runtime schema drift/cache staleness was not guarded.
2. External jobs were implemented as a side module rather than integrated with core bounty/booking flows.

## What changed

### 1. Runtime schema parity guards

Added `apps/web/src/lib/schema-parity.ts` with:

- required table probes
- schema-cache/missing-table detection (`PGRST205`, `42P01`, message patterns)
- short-lived in-memory result cache
- standardized API error body (`SCHEMA_PARITY_UNAVAILABLE`) with remediation metadata

Routes now guarded:

- Integrations:
  - `/api/v1/integrations`
  - `/api/v1/integrations/[provider]`
  - `/api/v1/integrations/[provider]/test`
  - `/api/v1/integrations/proxypics/templates`
  - `/api/v1/integrations/providers`
- External jobs:
  - `/api/v1/external-jobs`
  - `/api/v1/external-jobs/[id]`
  - `/api/v1/external-jobs/[id]/refresh`
  - `/api/v1/external-jobs/[id]/messages`
  - `/api/v1/external-jobs/[id]/reject`
  - plus write routes via shared helper `lib/external-jobs/http.ts`
- Autopilot settings surfaces:
  - `/api/v1/autopilot/actions`
  - `/api/v1/autopilot/actions/[actionId]/rollback`

### 2. Migration hygiene gate

Added `scripts/quality/check-migration-prefix-collisions.mjs` and wired it into `pnpm verify`.

- Fails on new duplicate migration prefixes.
- Legacy collisions `024` and `025` are temporarily allowlisted and explicitly warned.

### 3. Provider plugin framework

Added provider runtime abstraction:

- `apps/web/src/lib/external-jobs/providers/types.ts`
- `apps/web/src/lib/external-jobs/providers/registry.ts`
- `apps/web/src/lib/external-jobs/providers/proxypics.ts` (active)
- `apps/web/src/lib/external-jobs/providers/wegolook.ts` (planned scaffold)

Service layer `apps/web/src/lib/external-jobs/service.ts` refactored to route provider operations through plugin interface instead of hardcoded provider branching.

### 4. Provider catalog endpoint

Added `GET /api/v1/integrations/providers`:

- provider metadata
- capabilities
- supported envs
- configured env masks/status for current Molty

Settings UI now consumes provider catalog and renders provider cards (active + planned).

### 5. Linked external jobs model

Added migration:

- `packages/database/supabase/migrations/031_external_jobs_linked_records.sql`

`external_jobs` now supports optional links:

- `bounty_id`
- `booking_id`
- `application_id`
- `conversation_id`

DB trigger `validate_external_job_links` enforces:

- linked record ownership must match `external_jobs.agent_id`
- cross-link consistency (booking vs bounty/application, application vs bounty)

API extensions in `/api/v1/external-jobs`:

- POST accepts link fields above
- GET supports filtering by link fields

### 6. Core product integration

Bounty detail page:

- owners can create linked field checks in-page
- owners can view linked field checks list/status

Booking detail page:

- linked field checks visible directly in booking workflow

## Docs added

- `docs/runbooks/schema-parity-and-cache-recovery.md`
- `docs/architecture/external-integrations-framework.md`

## OpenAPI/docs parity updates

- Added `/integrations/providers` to `apps/web/public/openapi.json`
- Added external-jobs link filters/body fields in OpenAPI
- Updated docs parity exclusion list for `/integrations/providers`

## Tests added

- `tests/web/lib/schema-parity.test.ts`
- `tests/web/lib/external-jobs/provider-registry.test.ts`
- `tests/web/api/integrations/providers.test.ts`

Also re-ran:

- OpenAPI parity tests
- docs source-of-truth parity tests

## High-signal gotchas

1. `SCHEMA_PARITY_UNAVAILABLE` is intentional; do not replace with raw provider/DB errors.
2. `provider.status='planned'` means credentials may exist but runtime operations must remain disabled.
3. Linked IDs are validated in both app service code and DB trigger; keep both layers.
4. Migration prefix checker currently allowlists legacy collisions 024/025 to avoid breaking current history; remove allowlist only after formal migration renumbering/reconciliation.

## Follow-up recommended

1. Add formal migration renumber/reconciliation plan for legacy collisions.
2. Add API integration tests for linked-ID conflict failures (DB trigger paths).

## Phase extension (same day)

### MCP tooling parity for linked integrations

Agent-facing MCP surfaces were further updated so external jobs are usable as first-class linked workflow actions:

- Added read tool `list_integration_providers` mapped to `GET /api/v1/integrations/providers`
- Extended `create_field_check` inputs to include linked IDs:
  - `bounty_id`
  - `booking_id`
  - `application_id`
  - `conversation_id`
- Extended `list_field_checks` filters with the same linked IDs
- Fixed standalone MCP server refresh path:
  - from deprecated `GET /external-jobs/{id}?refresh=true`
  - to canonical `POST /external-jobs/{id}/refresh`

Files touched:

- `packages/analogresearch-mcp/src/tools.ts`
- `packages/analogresearch-mcp/src/index.ts`
- `apps/web/src/lib/mcp/dispatcher.ts`
- `tests/web/lib/mcp/dispatcher.test.ts`

### Generic external-job aliases (compatibility-safe)

Added generic aliases while preserving existing field-check names:

- `create_external_job`
- `list_external_jobs`
- `get_external_job`
- `refresh_external_job`
- `cancel_external_job`
- `send_external_job_message`
- `approve_external_job`
- `reject_external_job`

Field-check tools remain unchanged and map to the same API routes, preserving backward compatibility.

Additional quality coverage:

- `tests/web/lib/mcp/tools.test.ts` verifies alias registration and scope-gated visibility.

### External reference checks used in this pass

- RentAHuman MCP guide (`https://rentahuman.ai/mcp`) for practical tool-surface conventions (read/write mix, workflow aliases).
- OpenClaw docs (`https://docs.openclaw.ai/`) for gateway/plugin extensibility framing and multi-agent operational posture.

### Anti-drift test hardening (no fake pass checks)

Added stronger parity tests specifically to prevent MCP drift:

- Runtime dispatcher parity:
  - `tests/web/lib/mcp/dispatcher-parity.test.ts`
  - iterates every canonical tool in `MCP_TOOL_DEFINITIONS` and executes `dispatchMcpToolCall` with generated required args
  - fails if any tool returns unknown/unsupported path in dispatcher
- Standalone source parity:
  - `tests/web/docs/mcp-standalone-parity.test.ts`
  - compares canonical tool names from `packages/analogresearch-mcp/src/tools.ts` against `case` handlers in `packages/analogresearch-mcp/src/index.ts`
  - catches missing handlers and stale handlers

Intent: prevent “fake green” where docs look aligned but one runtime path silently drifts.

### Provider credential contract hardening (same day continuation)

To support the near-term “~10 provider” goal without rewriting integration routes per provider:

- Added `apps/web/src/lib/integrations/credentials.ts`:
  - parses `PUT /api/v1/integrations/[provider]` payloads against provider descriptor fields
  - enforces required credential fields from descriptor metadata
  - supports legacy `api_key` while accepting canonical `credentials` object payloads
  - normalizes camelCase/snake_case aliases for credential keys
  - generates safe credential masks for both single- and multi-secret providers

- Updated `apps/web/src/app/api/v1/integrations/[provider]/route.ts`:
  - moved from ProxyPics-specific payload shape to provider-descriptor shape
  - still backward compatible with existing clients using `api_key`
  - validates through provider plugin before encrypting/persisting

- Updated provider validators:
  - `apps/web/src/lib/external-jobs/providers/proxypics.ts`
  - `apps/web/src/lib/external-jobs/providers/wegolook.ts`
  - both now accept `apiKey` and `api_key` to reduce transport/client mismatch failures.

### Dashboard integration hardening (same continuation)

- Settings page (`apps/web/src/app/(dashboard)/dashboard/settings/page.tsx`) now runs provider-catalog-driven credential forms:
  - no ProxyPics-only write/test code path
  - per-provider env selection and test result state
  - descriptor-driven credential input rendering
  - capability-aware disabling (`test_connection=false`)

- Field checks page (`apps/web/src/app/(dashboard)/dashboard/field-checks/page.tsx`) now uses provider catalog:
  - provider dropdown is dynamically sourced from configured active providers with `create_field_check`
  - create action sends selected provider instead of hardcoded ProxyPics
  - explicit user-facing error when selected env has no configured provider

### Additional test coverage added

- `tests/web/lib/integrations/credentials.test.ts`
  - legacy + canonical payload parsing
  - alias normalization
  - required-field rejection
  - credential mask behavior
- `tests/web/api/integrations/provider-route.test.ts`
  - route-level backward compatibility + descriptor payload behavior
  - required-field rejection path
- `tests/web/lib/external-jobs/provider-registry.test.ts`
  - dual key-format credential validation checks.

### Verification result

- `pnpm verify` passed in full after this continuation.

### External realignment sources re-checked

- RentAHuman MCP guide: `https://rentahuman.ai/mcp`
- OpenClaw plugin/agent-tools docs:
  - `https://docs.openclaw.ai/plugins/agent-tools`
  - `https://docs.openclaw.ai/tools/plugin`

Decision rationale: keep API+UI contract descriptor-driven and capability-gated so adding providers remains additive (register descriptor/plugin + tests), not route/UI rewrites.
