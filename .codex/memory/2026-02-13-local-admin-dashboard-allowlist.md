# Local admin dashboard allowlist is required in apps/web/.env.local

Date: 2026-02-13

## Problem
Valid Supabase login succeeds, but `/admin` redirects or admin APIs return unauthorized/forbidden in local dev.

## Root cause
Admin access is gated by `ADMIN_EMAILS` (fallback `MODERATION_ADMIN_EMAILS`) in `apps/web/src/lib/admin/admin-auth.ts`.

`next dev` for `@analoglabor/web` loads `apps/web/.env.local` (not root `.env`) for app runtime env values, so a missing allowlist there blocks admin pages even if test credentials are valid.

## Evidence
- `POST /auth/signin` returned `200 {"success":true}`
- Without local allowlist, admin endpoints did not authorize
- After adding `ADMIN_EMAILS=<email>` to `apps/web/.env.local`, `/api/v1/admin/stats` and `/admin` returned `200`

## Fix pattern
1. Set `ADMIN_EMAILS` in `apps/web/.env.local` for local development.
2. Ensure the signed-in email is present in that comma-separated list.
3. Restart `next dev` after env changes.

