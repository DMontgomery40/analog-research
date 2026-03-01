# 2026-02-11: UI Integration Unification for Linked Field Checks

## Why this was needed
- Bounty detail had a hardcoded `provider: 'proxypics'` create path while Settings/Field Checks had already moved to provider-catalog behavior.
- This created immediate UX drift and future scale risk (goal is ~10 providers, not one).
- Booking detail showed linked checks but lacked clear workflow guidance for where to create/manage them.

## What was changed
- Added shared provider-aware composer component:
  - `apps/web/src/components/field-checks/FieldCheckOrderForm.tsx`
  - Loads `/api/v1/integrations/providers`, filters to active/configured providers with `create_field_check`, supports `live|sandbox`, and submits to `/api/v1/external-jobs`.
  - Accepts linked record IDs (`bounty_id`, `booking_id`, `application_id`, `conversation_id`) so callers can attach field checks to marketplace records.
- Added pure UI selection helpers:
  - `apps/web/src/lib/external-jobs/provider-ui.ts`
  - Functions:
    - `getProviderEnvStatus`
    - `listAvailableFieldCheckProviders`
    - `resolveFieldCheckProviderSelection`
- Replaced duplicated form logic on:
  - `apps/web/src/app/(dashboard)/dashboard/field-checks/page.tsx`
  - `apps/web/src/app/(dashboard)/dashboard/bounties/[id]/page.tsx`
- Improved workflow discoverability:
  - `apps/web/src/app/(dashboard)/dashboard/settings/page.tsx`
    - Added configured-provider summary + direct links to Field Checks and Bounties.
  - `apps/web/src/app/(dashboard)/dashboard/bookings/[id]/page.tsx`
    - Added action bar for linked evidence navigation (`Order from Bounty` / `Order Field Check` + `View All`).
  - `apps/web/src/app/(dashboard)/dashboard/bounties/[id]/page.tsx`
    - Added `id="linked-field-checks"` anchor for direct booking-to-bounty jump.

## Behavioral outcomes
- No more hardcoded provider in bounty linked field-check creation.
- Field-check creation UX now has one implementation path, reducing drift risk as providers are added.
- Booking -> Bounty -> Linked Field Checks path is now explicit for operators.

## Test coverage added
- `tests/web/lib/external-jobs/provider-ui.test.ts`
  - Validates provider filtering, selection fallback, empty-state behavior, and missing-env handling.
- Existing provider registry tests remain in place:
  - `tests/web/lib/external-jobs/provider-registry.test.ts`

## Verification
- Full quality gate passed:
  - `pnpm verify`

## External alignment references checked during this phase
- OpenClaw plugin/extensibility docs: https://docs.openclaw.ai/plugins
- OpenClaw threat model (operational safety framing): https://github.com/openclaw/openclaw/blob/main/docs/security/THREAT-MODEL-ATLAS.md
- RentAHuman MCP integration UX framing: https://rentahuman.ai/mcp

## Guardrail for future work
- Any new external-provider UX must consume provider catalog descriptors and avoid provider-specific hardcoding in page-level UI logic.
- If a provider-specific behavior is required, encapsulate it behind descriptor/capability checks in shared components/helpers.
