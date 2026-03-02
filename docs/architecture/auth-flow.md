# Auth Flow Architecture

Human authentication on Analog Research uses Supabase Auth with a host-based proxy and subdomain setup. This document describes the flow, constraints, and operational notes.

## Overview

| Flow | Method | Components |
|------|--------|------------|
| Login/Signup | Supabase Auth (OAuth + email/password) | `(auth)/login`, `(auth)/signup` |
| OAuth callback | PKCE, client-side exchange | `/auth/callback` → `/auth/callback/complete` |
| Session gating | Cookie heuristic + Supabase validation | `proxy.ts` + `session-gate.ts` |
| Public auth check | Server endpoint | `/api/auth/me` (used by PublicNav) |

## Subdomain Architecture

| Subdomain | Purpose | Implementation |
|-----------|---------|----------------|
| `analog-research.org` | Main web app (auth, dashboard, browse) | Next.js pages |
| `api.analog-research.org` | API-only | JSON endpoints, `/v1/*` rewrite |
| `supabase.analog-research.org` | Supabase proxy | Rewrite to Supabase (auth, storage, realtime) |

All routing is in `apps/web/src/proxy.ts`. **Netlify redirects with Host conditions do not work with the Next.js runtime** — see `netlify.toml`. The proxy runs at the edge; the `Host` header is preserved.

Auth flows (login, signup, callback) run on the main domain. Supabase auth endpoints are reached via `supabase.analog-research.org` when configured.

## OAuth PKCE Flow

1. User clicks "Sign in with Google" on `/login`
2. `createClient()` from `@/lib/supabase/client` initiates OAuth; Supabase writes PKCE verifier to **cookies**
3. User is redirected to provider, then back to `/auth/callback?code=...`
4. Callback page (client) exchanges `code` for a session using the same cookie storage, then redirects to `/auth/callback/complete?redirect=...`
5. Completion route validates the session, ensures a `humans` row exists, and redirects to the dashboard

**Critical:** The verifier must be read from the same storage it was written to. Keeping the exchange in the browser avoids host/header/cookie-domain mismatches in the proxy stack.

## MCP OAuth (ChatGPT App, Developer Mode)

Analog Research MCP supports OAuth bearer tokens in addition to API keys for ChatGPT App integrations.

### Resource metadata and challenge

- Metadata endpoint: `GET /.well-known/oauth-protected-resource` (rewritten to `/api/v1/mcp/oauth-protected-resource`)
- MCP transport endpoints:
  - `/api/v1/mcp` (existing API key + OAuth mixed endpoint)
  - `/api/v1/mcp/chatgpt` (ChatGPT connector runtime with mixed-auth tool invocation)
- Unauthorized MCP responses include `WWW-Authenticate: Bearer resource_metadata="..."` so compatible clients can discover auth requirements.

### ChatGPT endpoint behavior

- `tools/list` and initialization are accessible without auth on `/api/v1/mcp/chatgpt`.
- Tool invocation requires OAuth/API-key auth and enforces per-tool scope policy from canonical `securitySchemes`.
- Auth failures return `_meta["mcp/www_authenticate"]` challenge hints to trigger connector relink/scope upgrade.
- Widget resources are exposed through `resources/list` + `resources/read` using versioned `ui://analogresearch/.../v1` URIs.

### Dashboard linking flow

- Start link: `POST /api/v1/mcp/oauth/link/start`
- Callback: `GET /api/v1/mcp/oauth/link/callback`
- Status: `GET /api/v1/mcp/oauth/link`
- Unlink: `DELETE /api/v1/mcp/oauth/link`

Link state is persisted in `mcp_oauth_link_states` and OAuth subject-to-ResearchAgent mapping is persisted in `mcp_oauth_identities`.

### Auth0 redirect allowlist requirements

For ChatGPT App testing/review readiness, include both redirect URLs in the Auth0 application:

- `https://chatgpt.com/connector_platform_oauth_redirect`
- `https://platform.openai.com/apps-manage/oauth`

### Phase 3 operational contract (developer mode + beta readiness)

Use these values as the source-of-truth contract for ChatGPT connector runtime:

| Variable | Required value pattern | Notes |
|---|---|---|
| `MCP_OAUTH_ENABLED` | `true` | Enables OAuth verification + challenge responses |
| `MCP_OAUTH_PROVIDER` | `auth0` | Provider key used in `mcp_oauth_identities` lookup |
| `MCP_OAUTH_ISSUER` | `https://<tenant>.auth0.com` | Must match token `iss` exactly |
| `MCP_OAUTH_AUDIENCE` | `https://api.analog-research.org` | Must match token `aud` |
| `MCP_OAUTH_RESOURCE` | `https://api.analog-research.org/api/v1/mcp/chatgpt` | Protected resource identifier advertised by metadata endpoint |
| `MCP_OAUTH_SCOPES_READ` | `analogresearch.read` | Read tool scope |
| `MCP_OAUTH_SCOPES_WRITE` | `analogresearch.write` | Write tool scope |
| `AUTH0_MCP_LINK_CLIENT_ID` | Auth0 app client id | Used by dashboard link start/callback |
| `AUTH0_MCP_LINK_CLIENT_SECRET` | Auth0 app client secret | Server-side code exchange |

Expected external connector URL in ChatGPT Developer Mode:

- `https://api.analog-research.org/v1/mcp/chatgpt`

Expected metadata URL:

- `https://api.analog-research.org/.well-known/oauth-protected-resource`

### Operational preflight checks

Run these before any dogfood/beta pass:

1. Confirm metadata contract:
   - `curl -s https://api.analog-research.org/.well-known/oauth-protected-resource | jq`
   - Verify `resource` is `https://api.analog-research.org/api/v1/mcp/chatgpt`
   - Verify `authorization_servers` includes your Auth0 issuer.
2. Confirm unauthenticated connector challenge:
   - Send MCP `tools/call` to `/v1/mcp/chatgpt` without auth.
   - Verify `_meta["mcp/www_authenticate"]` and `resource_metadata` hint are returned.
3. Confirm owner link state path:
   - Link via dashboard settings, then `GET /api/v1/mcp/oauth/link` shows `linked: true`.
   - Unlink and verify subsequent OAuth tool calls fail with auth challenge.

Full manual workflow and evidence template: `docs/runbooks/chatgpt-developer-mode-smoke.md`.

## Session Gating

`session-gate.ts` is invoked by `proxy.ts` for the main domain only. It:

- Does **not** call Supabase for routes that don't need auth (marketing, docs, etc.)
- Uses a cookie heuristic to detect session-like cookies before validating
- Only calls `supabase.auth.getUser()` when a protected route is accessed and a session cookie exists

This avoids exhausting Supabase rate limits on unauthenticated traffic.

## Infinite Token Refresh Loop (Fixed)

**Problem:** Components creating a browser Supabase client on public pages triggered endless `refresh_token` requests when stale cookies existed, leading to 429s.

**Fix:** PublicNav uses `/api/auth/me` instead of instantiating a browser Supabase client. The server endpoint runs once per page load.

**Rule:** Do not create a browser Supabase client on public/marketing pages just to check "is user logged in?" Use `/api/auth/me` or similar.

## Cookie Domain

`getSupabaseAuthCookieDomain()` in `@/lib/supabase/cookie-domain.ts` sets `domain: '.analog-research.org'` so sessions persist across `www.analog-research.org` and `analog-research.org`.

## Related Documentation

- [.codex/memory/2026-02-11-auth-infinite-loop-pkce-and-netlify.md](../../.codex/memory/2026-02-11-auth-infinite-loop-pkce-and-netlify.md) — Detailed fixes and root causes
- [.codex/memory/2026-02-09-auth-callback-pkce.md](../../.codex/memory/2026-02-09-auth-callback-pkce.md) — PKCE and rate limit notes
