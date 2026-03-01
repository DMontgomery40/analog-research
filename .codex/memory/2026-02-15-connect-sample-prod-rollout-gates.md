# Stripe Connect Sample Prod Rollout Gates (2026-02-15)

## Context

We shipped Stripe Connect sample routes/pages to `main` and expected `/connect-sample` + `/api/v1/connect-sample/storefront` to go live immediately.

## What actually failed

1. Netlify production build failed for commit `6dc3bbc`:
   - Error: Next.js prerender failure on `/connect-sample/success`
   - Root cause: `useSearchParams()` used directly in a client page without Suspense boundary.
2. After code fix + redeploy, storefront still returned `503`:
   - First gate: `STRIPE_CONNECT_SAMPLE_ENABLED` was disabled in production env.
   - Second gate: `STRIPE_SECRET_KEY` was missing in production env.
   - Third gate: migration `047_stripe_connect_sample_accounts.sql` not applied, causing schema-parity `503`.

## Fixes applied

- Replaced `useSearchParams()` pattern with server-side `searchParams` prop in `apps/web/src/app/connect-sample/success/page.tsx`.
- Enabled production env flag:
  - `STRIPE_CONNECT_SAMPLE_ENABLED=true`
- Added Stripe key envs in Netlify production context:
  - `STRIPE_SECRET_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Triggered explicit production deploys after env changes (env change alone does not update already-running runtime).

## Remaining blocker

`/api/v1/connect-sample/storefront` still fails until migration `047` is applied to production DB.

## Operational rules captured

1. For App Router pages, avoid direct `useSearchParams()` on pages that may be prerendered unless wrapped in Suspense.
2. Treat env changes as rollout events: set env, then force a production deploy.
3. For new API surfaces guarded by schema parity, include DB migration rollout in the same change window.
4. If `pnpm db:push` cannot run (missing Supabase access token / DB URL), escalate immediately; code deploy alone is insufficient.
