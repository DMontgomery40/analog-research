## New-user funnel: email confirm callback + API key generation (Netlify Edge gotchas)

Status: Superseded on 2026-02-13 for callback implementation details.

Use these current notes first:
- `2026-02-09-auth-callback-pkce.md`
- `2026-02-11-auth-infinite-loop-pkce-and-netlify.md`

The callback implementation in this note references a legacy server route (`/auth/callback/route.ts`) that no longer exists in the current flow.

### Symptoms
- Clicking Supabase email confirmation links landed on `/login?error=auth` instead of establishing a session.
- Dashboard Settings -> Generate API key failed with a generic `"Failed to create agent account"`.

### Root causes / patterns
- `/auth/callback` only handled the OAuth PKCE `?code=` flow and ignored the email-confirm flow (`?token_hash=...&type=signup`).
- Route handlers that import Node-only modules (notably `@/lib/api-auth` uses `crypto`) can break under Netlify Edge when `NEXT_USE_NETLIFY_EDGE=true` unless they explicitly force Node runtime.
- Privileged writes (`agents`, `api_keys`) must be performed with a cookie-less service-role client to bypass RLS (tables like `api_keys` are "deny all" under RLS).

### Fixes applied (reference implementation)
- `apps/web/src/app/auth/callback/route.ts`
  - Handle both `?code=` and `?token_hash=...&type=...` (via `verifyOtp`).
  - Propagate auth errors to `/login` using `error`, `error_code`, `error_description`.
  - Create `humans` row using the session client (RLS allows `INSERT` when `auth.uid() = user_id`).
  - `export const runtime = 'nodejs'`.
- `apps/web/src/app/api/v1/keys/route.ts` and `apps/web/src/app/api/v1/keys/[id]/route.ts`
  - `export const runtime = 'nodejs'`.
  - Log Supabase error fields `{ message, code, details, hint }` when agent/key creation fails.
- Netlify Edge hardening:
  - Any API route importing `@/lib/api-auth` should export `runtime='nodejs'` to avoid edge runtime crypto/env issues.

### Regression tests
- Unit: `tests/web/lib/auth-callback.test.ts` covers callback param parsing and redirect sanitization.
- Smoke E2E: `pnpm smoke:e2e` (Playwright) covers confirm-link -> dashboard settings -> generate key -> API-key authenticated call.
