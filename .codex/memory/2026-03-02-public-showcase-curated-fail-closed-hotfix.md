# Public Showcase Curated Fail-Closed Hotfix (2026-03-02)

## What changed
- Added shared public visibility controls in `apps/web/src/lib/public-showcase.ts`.
- Default mode is `PUBLIC_SHOWCASE_MODE=curated`, which fail-closes public humans/bounties when curated ID env vars are missing.
- Public list/detail reads now enforce curated IDs across:
  - API routes (`/api/v1/humans`, `/api/v1/humans/[id]`, `/api/v1/bounties`, `/api/v1/bounties/[id]`)
  - public pages (`/browse`, `/humans/[id]`, `/bounties`, `/bounties/[id]`)
  - sitemap (`/sitemap.xml`)

## Operational workflow
- Use `scripts/public-showcase/refresh-showcase-data.mjs`:
  - default `--dry-run`
  - `--apply` for mutation
- Script emits machine-readable JSON with `human_ids` + `bounty_ids` for env wiring.
- Runbook: `docs/runbooks/public-showcase-hotfix.md` documents dry-run/apply/env/redeploy/verification sequence.

## Gotchas
- Curated mode intentionally returns empty public lists / 404 detail responses when ID env vars are absent.
- `pnpm verify` can fail on realness gates if env is incomplete:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_CANARY_CONNECTED_ACCOUNT_ID`
