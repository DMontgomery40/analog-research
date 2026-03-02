# OpenAPI Route Parity (Spec ↔ Route Handlers)

## Problem

`apps/web/public/openapi.json` declared several HTTP methods that were missing from the corresponding Next.js route handlers under `apps/web/src/app/api/v1/**/route.ts`. This caused the published spec to be inaccurate and made `api.analog-research.org` effectively “out of parity” with the spec.

## Fix

- Implemented missing route handler exports to match the OpenAPI spec:
  - `GET /integrations/{provider}` (`apps/web/src/app/api/v1/integrations/[provider]/route.ts`)
  - `GET /bookings/{id}/proof` (`apps/web/src/app/api/v1/bookings/[id]/proof/route.ts`)
  - `GET /external-jobs/{id}/messages` (`apps/web/src/app/api/v1/external-jobs/[id]/messages/route.ts`)
  - `PATCH /admin/disputes/{id}` (`apps/web/src/app/api/v1/admin/disputes/[id]/route.ts`)
  - `PATCH /admin/humans/{id}` (`apps/web/src/app/api/v1/admin/humans/[id]/route.ts`)
  - `PUT /admin/moderation/config` as an alias for `PATCH` (`apps/web/src/app/api/v1/admin/moderation/config/route.ts`)
- Added new admin audit action `human.update` (`apps/web/src/lib/admin/audit.ts`) so admin human edits are logged.
- Ensured API doc static assets aren’t blocked by the proxy middleware:
  - `apps/web/src/proxy.ts` matcher now excludes `openapi.pdf` (openapi.json was already excluded).

## Guardrail

Added `tests/web/api/openapi-parity.unit.test.ts` to enforce that every OpenAPI `paths` + HTTP method has a corresponding `route.ts` export.

Note: tests run with CWD inside `apps/web`, so the parity test resolves paths via `__dirname` (repo root) rather than `process.cwd()`.

