# 3rd-Party Integrations (External Fulfillment)

Owner: Codex (this repo)

This file is **institutional memory** for 3rd-party “humans everywhere” integrations.

Status (2026-02-09): External-fulfillment integrations are being implemented (v1: field checks via ProxyPics).

## Core Framing (Do Not Drift)
- AnalogLabor only takes off if autonomous Moltys can **order/coordinate** work from where humans already are.
- The agent must be able to **take actions** (order, message, track, fetch deliverables), not return “web search results”.
- Start with fulfillment networks that already provide “order + status + deliverable” APIs (ProxyPics now; WeGoLook once partner docs/keys exist).

## v1 Architecture (Provider-Agnostic)
- `external_integrations`: encrypted provider credentials per Molty (`agents` table, legacy naming).
- `external_jobs`: canonical “Molty ordered external work” record (v1 kind: `field_check`).
- `external_job_events`: append-only timeline for webhooks + polling refresh + messages + approvals.

### Provider Strategy
- **ProxyPics**: full implementation (sandbox supported).
- **WeGoLook**: scaffold only (docs are login-gated; implement once partner API details are obtained).

## Non-Negotiables
- Never store provider secrets in plaintext. Encrypt at rest (AES-256-GCM) using `INTEGRATIONS_ENCRYPTION_KEY_BASE64`.
- Never return decrypted credentials from HTTP responses.
- Webhooks must be idempotent (use `webhook_events` table).
- Research discipline: "This is definitely niche, and there’s a significant chance I might recall the wrong information," so verify provider behavior against primary docs and/or sandbox responses before shipping changes.

## Key Files (Review After Every Compaction)
- DB: `packages/database/supabase/migrations/021_external_jobs_and_integrations.sql`
- MCP tool defs: `packages/analoglabor-mcp/src/tools.ts` (and built `packages/analoglabor-mcp/dist/tools.js`)
- MCP dispatcher: `apps/web/src/lib/mcp/dispatcher.ts`
- Secrets: `apps/web/src/lib/integrations-secrets.ts`
- External jobs types: `apps/web/src/lib/external-jobs/types.ts`
- External jobs core: `apps/web/src/lib/external-jobs/service.ts`
- ProxyPics adapter: `apps/web/src/lib/external-jobs/proxypics.ts`
- ProxyPics webhook handler: `apps/web/src/lib/external-jobs/proxypics-webhook.ts`
- External jobs API: `apps/web/src/app/api/v1/external-jobs/route.ts`
- External job detail API: `apps/web/src/app/api/v1/external-jobs/[id]/route.ts`
- Integrations API: `apps/web/src/app/api/v1/integrations/route.ts`
- Provider integration API: `apps/web/src/app/api/v1/integrations/[provider]/route.ts`
- ProxyPics webhook routes:
  - `apps/web/src/app/api/v1/webhooks/proxypics/live/route.ts`
  - `apps/web/src/app/api/v1/webhooks/proxypics/sandbox/route.ts`
- Dashboard UI:
  - `apps/web/src/app/(dashboard)/dashboard/settings/page.tsx`
  - `apps/web/src/app/(dashboard)/dashboard/field-checks/page.tsx`
  - `apps/web/src/app/(dashboard)/dashboard/field-checks/[id]/page.tsx`

## ProxyPics v3 Notes (Verified)
- Base URLs:
  - Live: `https://api.proxypics.com/api/v3`
  - Sandbox: `https://sandbox.proxypics.com/api/v3`
- Auth: `x-api-key: <token>` header (docs also mention query param `api_key`)
- Create photo request (`POST /photo-requests`) request fields we rely on:
  - `address` (required)
  - `additional_notes` (use for our field check instructions + “PUBLIC ONLY” constraints)
  - `template_token` (optional; recommended)
  - `tasks` (required if no `template_token`; items have `title`, `description`, optional `photo_map`)
  - `external_id` (optional; set to our `external_jobs.id` to map webhooks)
  - `photo_request_platform` enum includes `crowdsource`, `direct` (use `crowdsource` by default when no template)
  - `expires_at`, `scheduled_at`, `price_boost` (cents) supported
- Reject (`PUT /photo-requests/{id}/reject`) uses:
  - `reason` enum: `unspecified`, `blurry_photo`, `wrong_direction`, `incorrect_property`, `people_in_photo`, `property_not_visible`, `other`
  - `clarification` required if `reason=other`
- Webhooks: payload includes `event_name` (see docs list); treat webhook as refresh trigger (payload shape not fully specified in docs).

## Phase Log

### Phase 0 (2026-02-09): Memory + Plan Lock
- Created this file; must be updated after each phase.

### Phase 1 (2026-02-09): DB Schema Added
- Added migration: `packages/database/supabase/migrations/021_external_jobs_and_integrations.sql`
- Status spelling: internal canonical is `cancelled` (match existing DB enums); accept/normalize `canceled` at API boundary.

### Phase 2 (2026-02-09): Server Libraries Added
- Added encryption lib: `apps/web/src/lib/integrations-secrets.ts` (AES-256-GCM, `INTEGRATIONS_ENCRYPTION_KEY_BASE64`)
- Added ProxyPics adapter + orchestration: `apps/web/src/lib/external-jobs/proxypics.ts`, `apps/web/src/lib/external-jobs/service.ts`

### Phase 3 (2026-02-09): API Surface Added
- Integrations API:
  - `GET /api/v1/integrations`
  - `PUT /api/v1/integrations/:provider` (store encrypted API key)
  - `POST /api/v1/integrations/:provider/test`
  - `GET /api/v1/integrations/proxypics/templates`
- External jobs API:
  - `GET /api/v1/external-jobs?kind=field_check`
  - `POST /api/v1/external-jobs` (creates job + orders provider work)
  - `GET /api/v1/external-jobs/:id?refresh=true`
  - `POST /api/v1/external-jobs/:id/{cancel|messages|approve|reject}`
- ProxyPics inbound webhooks (token-auth + webhook_events idempotency):
  - `POST /api/v1/webhooks/proxypics/live?token=...`
  - `POST /api/v1/webhooks/proxypics/sandbox?token=...`

### Phase 4 (2026-02-09): Dashboard UI Added
- Settings now supports ProxyPics key configuration + connection test:
  - `apps/web/src/app/(dashboard)/dashboard/settings/page.tsx`
- Field check pages for ordering + viewing status/timeline:
  - `apps/web/src/app/(dashboard)/dashboard/field-checks/page.tsx`
  - `apps/web/src/app/(dashboard)/dashboard/field-checks/[id]/page.tsx`

### Phase 5 (2026-02-09): Quality Gates + Hardening
- Added helper to avoid cross-file duplicate blocks in integrations routes:
  - `apps/web/src/lib/integrations/http.ts` (`requireIntegrationProviderAccess`)
- Added pagination parser to avoid copy/pasted limit/offset parsing:
  - `apps/web/src/lib/request-params.ts` (`parsePaginationParams`)
- Fixed ProxyPics create payload typing:
  - `apps/web/src/lib/external-jobs/service.ts` now types request body as `ProxyPicsCreatePhotoRequestInput` to keep literal unions (e.g. `photo_request_platform`) from widening.
- `pnpm verify` passes end-to-end (2026-02-09).

### Phase 6 (2026-02-11): Schema Parity + Provider Framework + Linked Core Surfaces
- Added runtime schema parity guard with machine-readable 503 payloads:
  - `apps/web/src/lib/schema-parity.ts`
  - applied to integrations/external-jobs/autopilot-actions routes
- Added provider plugin framework + registry:
  - `apps/web/src/lib/external-jobs/providers/types.ts`
  - `apps/web/src/lib/external-jobs/providers/registry.ts`
  - `apps/web/src/lib/external-jobs/providers/proxypics.ts`
  - `apps/web/src/lib/external-jobs/providers/wegolook.ts` (planned scaffold)
- Refactored external jobs runtime to plugin-based provider dispatch:
  - `apps/web/src/lib/external-jobs/service.ts`
- Added provider catalog endpoint:
  - `GET /api/v1/integrations/providers`
  - `apps/web/src/app/api/v1/integrations/providers/route.ts`
- Added optional linked IDs on external jobs with DB-level invariants:
  - migration `packages/database/supabase/migrations/031_external_jobs_linked_records.sql`
  - supports `bounty_id`, `booking_id`, `application_id`, `conversation_id`
- Integrated linked field checks into core UX:
  - bounty detail page owner workflow: `apps/web/src/app/(dashboard)/dashboard/bounties/[id]/page.tsx`
  - booking detail linked visibility: `apps/web/src/app/(dashboard)/dashboard/bookings/[id]/page.tsx`
- Updated Settings integrations panel to render provider catalog cards:
  - `apps/web/src/app/(dashboard)/dashboard/settings/page.tsx`
- Added migration prefix collision quality gate:
  - `scripts/quality/check-migration-prefix-collisions.mjs`
  - wired into `.claude/hooks/run-quality-gates.sh` + `package.json`
- Added tests:
  - `tests/web/lib/schema-parity.test.ts`
  - `tests/web/lib/external-jobs/provider-registry.test.ts`
  - `tests/web/api/integrations/providers.test.ts`

### Phase 7 (2026-02-11): MCP Parity for Linked External Jobs
- Added MCP read tool for provider catalog:
  - `list_integration_providers` → `GET /api/v1/integrations/providers`
- Extended MCP `create_field_check` tool args with linked records:
  - `bounty_id`, `booking_id`, `application_id`, `conversation_id`
- Extended MCP `list_field_checks` filters with the same linked IDs.
- Updated standalone MCP transport routing for refresh to canonical endpoint:
  - `POST /external-jobs/{id}/refresh`
  - (removed deprecated `?refresh=true` usage)
- Added dispatcher coverage:
  - `tests/web/lib/mcp/dispatcher.test.ts` now checks provider-catalog routing and linked-ID forwarding.

### Phase 8 (2026-02-11): Generic External-Job MCP Aliases + Permission Tests
- Added compatibility-safe generic MCP aliases (field-check aliases preserved):
  - `create_external_job`
  - `list_external_jobs`
  - `get_external_job`
  - `refresh_external_job`
  - `cancel_external_job`
  - `send_external_job_message`
  - `approve_external_job`
  - `reject_external_job`
- Added dispatcher/runtime support:
  - `apps/web/src/lib/mcp/dispatcher.ts`
  - `packages/analoglabor-mcp/src/index.ts`
- Updated MCP docs page parity:
  - `apps/web/src/app/mcp/page.tsx`
- Added tests:
  - `tests/web/lib/mcp/tools.test.ts` (scope-gated tool visibility + alias registration)
  - expanded `tests/web/lib/mcp/dispatcher.test.ts` for alias route/payload behavior
- External references checked in this phase:
  - `https://rentahuman.ai/mcp`
  - `https://docs.openclaw.ai/`

### Phase 9 (2026-02-11): MCP Anti-Drift Test Hardening
- Added runtime parity test that exercises every canonical MCP tool through web dispatcher:
  - `tests/web/lib/mcp/dispatcher-parity.test.ts`
- Added standalone MCP source parity test (switch cases vs canonical tool defs):
  - `tests/web/docs/mcp-standalone-parity.test.ts`
- Added external-jobs route validation unit coverage:
  - `tests/web/api/external-jobs/route.unit.test.ts`
  - checks invalid UUID filters, canceled→cancelled normalization, and linked-ID passthrough to service layer.

This phase explicitly targets “no fake tests” by asserting full canonical tool coverage paths, not just single happy paths.

### Phase 10 (2026-02-11): Provider-Credential Contract + Catalog-Driven UI
- Generalized integration credential updates for scale beyond a single provider key:
  - new helper `apps/web/src/lib/integrations/credentials.ts`
  - API now supports provider-shaped credentials (`credentials` object) while preserving legacy `api_key` compatibility.
  - required credential fields are enforced from provider descriptor metadata before persistence.
- Hardened credential handling semantics:
  - persisted credentials are encrypted at rest as before.
  - mask rendering now derives from provider credential schema (single-secret and multi-secret safe display formats).
  - provider credential validation supports both camelCase (`apiKey`) and snake_case (`api_key`) aliases to avoid client drift.
- Refactored dashboard Settings integrations panel to provider-catalog runtime model:
  - removed ProxyPics-only write/test controls.
  - each provider card now uses descriptor-driven credential inputs, per-env save, and per-env connection tests.
  - keeps capability awareness (`test_connection` false => test button disabled with explicit explanation).
- Refactored dashboard Field Checks page to configured-provider runtime model:
  - provider selection now comes from `GET /api/v1/integrations/providers`.
  - only active providers with `create_field_check` capability and configured credentials for selected env are selectable.
  - create flow no longer hardcodes `provider='proxypics'`.
- Added high-signal tests:
  - `tests/web/lib/integrations/credentials.test.ts`
  - `tests/web/api/integrations/provider-route.test.ts`
  - updated `tests/web/lib/external-jobs/provider-registry.test.ts` for dual credential alias acceptance.
- Full gate outcome:
  - `pnpm verify` passed after this phase.

### External-doc realignment snapshot (same phase)
- RentAHuman MCP page (`https://rentahuman.ai/mcp`) re-checked:
  - reinforces action-oriented tooling with explicit read/write boundaries.
  - validates expectation that API key requirements differ by operation class.
- OpenClaw plugin docs re-checked:
  - `https://docs.openclaw.ai/plugins/agent-tools`
  - `https://docs.openclaw.ai/tools/plugin`
  - reinforces descriptor/allowlist/plugin-driven extensibility pattern over one-off hardcoding.

### Phase 11 (2026-02-11): UI Workflow Unification for Linked Field Checks
- Eliminated the last hardcoded provider path in bounty-linked field-check ordering:
  - replaced `provider='proxypics'` UI hardcoding with provider-catalog selection behavior.
- Added shared field-check ordering composer used by both dashboard entry points:
  - `apps/web/src/components/field-checks/FieldCheckOrderForm.tsx`
  - consumes `/api/v1/integrations/providers` and enforces active+configured+capability-filtered options for selected env.
- Added shared provider selection helpers:
  - `apps/web/src/lib/external-jobs/provider-ui.ts`
- Rewired pages to use unified form:
  - `apps/web/src/app/(dashboard)/dashboard/field-checks/page.tsx`
  - `apps/web/src/app/(dashboard)/dashboard/bounties/[id]/page.tsx`
- Added booking workflow affordances so operators can navigate to linked creation context:
  - `apps/web/src/app/(dashboard)/dashboard/bookings/[id]/page.tsx`
  - bounty section anchor: `apps/web/src/app/(dashboard)/dashboard/bounties/[id]/page.tsx#linked-field-checks`
- Added tests:
  - `tests/web/lib/external-jobs/provider-ui.test.ts`
- Quality result:
  - `pnpm verify` PASS.

### Phase 12 (2026-02-11): Raised-Hand Connector Framing + Landing Visibility
- Added top-level marketing visibility for external connector strategy:
  - top nav link to `#talent-networks`
  - landing section with connector cards and staged readiness labels
  - files:
    - `apps/web/src/components/public-nav.tsx`
    - `apps/web/src/app/page.tsx`
- Added source-of-truth connector matrix for worker marketplaces:
  - `apps/web/src/lib/integrations/marketplace-connectors.ts`
  - current set: `analoglabor`, `upwork`, `thumbtack`, `taskrabbit`, `fiverr`
  - status model: `live | partner_onboarding | researching`
- Added policy invariant to prevent future product drift:
  - every connector has `supportsColdOutreach: false`
  - test coverage:
    - `tests/web/lib/integrations/marketplace-connectors.test.ts`
- External doc re-alignment captured (re-checked in this phase):
  - OpenClaw:
    - `https://docs.openclaw.ai/tools/agent-send`
    - `https://docs.openclaw.ai/plugins/agent-tools`
    - `https://docs.openclaw.ai/tools/plugin`
  - RentAHuman:
    - `https://rentahuman.ai/mcp`
    - `https://rentahuman.ai/for-agents`
    - `https://rentahuman.ai/blog/mcp-integration-guide`
  - Marketplace sources:
    - Upwork GraphQL docs: `https://www.upwork.com/developer/documentation/graphql/api/docs/index.html`
    - Thumbtack partner docs: `https://developers.thumbtack.com/docs/overview`
    - Taskrabbit partner API docs: `https://developer.taskrabbit.com/docs/overview-taskrabbit-home-services-api`
    - Fiverr developer portal: `https://developers.fiverr.com/`

This phase intentionally avoided adding new payment/execution behavior. It is UI + policy framing + research-lock groundwork for safe connector onboarding.
