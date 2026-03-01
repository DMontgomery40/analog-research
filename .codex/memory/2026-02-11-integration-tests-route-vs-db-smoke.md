# Integration tests: endpoint behavior vs DB smoke checks

## Context

Several `tests/web/api/**/...test.ts` files were labeled as API integration tests but only performed service-role DB queries. This created false confidence because endpoint behavior (auth, validation, response shape, route wiring) was not exercised.

## Pattern adopted

1. Keep protected `*.test.ts` files focused on **real endpoint behavior** (no mocks), e.g.:
   - call route handlers directly when feasible (Stripe webhook signature checks)
   - or call live HTTP API endpoints for auth/validation contract checks
2. Preserve old DB-only checks in clearly named `*.db-smoke.test.ts` files with explicit comments:
   - they check persistence/query shape only
   - they do **not** claim endpoint coverage

## Execution behavior

- `apps/web/vitest.config.ts` excludes protected integration tests unless `RUN_INTEGRATION_TESTS=true`.
- DB smoke files use `it.skip` unless `RUN_INTEGRATION_TESTS=true` and required Supabase env vars are present.
- `.claude/hooks/check-real-tests.sh` enforces that protected integration files do not use mocking patterns.

## Why this matters

- Prevents “integration test passed” false positives when the API route itself is broken.
- Keeps non-integration local runs fast and deterministic while preserving optional deeper checks.
