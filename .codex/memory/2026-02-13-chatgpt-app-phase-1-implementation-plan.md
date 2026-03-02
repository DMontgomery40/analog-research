# ChatGPT App Phase 1 (OAuth-First MCP) — Implementation Record

Date: 2026-02-13
Scope: Private ChatGPT Developer Mode app enablement for Analog Research via MCP OAuth + dashboard account linking.

## Goals

- Add OAuth auth path for MCP while preserving API-key compatibility.
- Publish protected resource metadata and OAuth challenge behavior for ChatGPT connector discovery.
- Add dashboard link/unlink lifecycle from OAuth subject to owner-operated Molty.
- Harden canonical MCP tool metadata for auth + guardrail hints.
- Add parity tests so auth/metadata/proxy behavior cannot silently drift.

## Implemented

### 1) DB and identity-link persistence

- Added migration `packages/database/supabase/migrations/038_mcp_oauth_identity_linking.sql`.
- New tables:
  - `mcp_oauth_identities`: provider/issuer/subject -> `agent_id` + `owner_human_id`, scopes, revocation, last-used.
  - `mcp_oauth_link_states`: one-time link-state records with expiry and consumption tracking.
- Added indexes, update triggers, and owner-scoped RLS policies using repo ownership patterns.
- `pnpm db:generate` was executed. Local CLI schema could not fully apply all pending migrations because of existing migration-prefix collisions in local state, so `packages/database/src/types.ts` was patched to include the new `mcp_oauth_*` tables explicitly without regressing existing staged schema work.

### 2) Unified auth path (API key + OAuth)

- Added `apps/web/src/lib/mcp/oauth-auth.ts`:
  - OAuth config resolution from env.
  - Bearer extraction.
  - JWT verification via `jose` (`createRemoteJWKSet` + `jwtVerify`).
  - Scope mapping (`analogresearch.read`/`analogresearch.write` -> internal `read`/`write`).
  - Subject mapping lookup in `mcp_oauth_identities`.
  - Synthetic `apiKeyId` generation for rate-limit bucket compatibility.
  - Challenge header builder for `WWW-Authenticate` with `resource_metadata`.
- Updated `apps/web/src/lib/api-auth.ts` to fall back to OAuth when API-key auth is absent.

### 3) MCP OAuth metadata + challenge behavior

- Added metadata endpoint:
  - `apps/web/src/app/api/v1/mcp/oauth-protected-resource/route.ts`
- Added proxy rewrite:
  - `apps/web/src/proxy.ts` rewrites `/.well-known/oauth-protected-resource` to `/api/v1/mcp/oauth-protected-resource`.
- Updated `apps/web/src/app/api/v1/mcp/route.ts`:
  - Accepts both API key and bearer token.
  - Adds `WWW-Authenticate` on 401 with `resource_metadata` and scope hint.
  - Emits `mcp/www_authenticate` tool error metadata for insufficient-scope tool calls when OAuth is configured.

### 4) Dashboard OAuth linking flow

- Added link helper:
  - `apps/web/src/lib/mcp/oauth-link.ts`
- Added routes:
  - `POST /api/v1/mcp/oauth/link/start`
  - `GET /api/v1/mcp/oauth/link/callback`
  - `GET /api/v1/mcp/oauth/link`
  - `DELETE /api/v1/mcp/oauth/link`
- Added settings UI:
  - `apps/web/src/components/settings/mcp-oauth-link-settings.tsx`
  - wired into `apps/web/src/app/(dashboard)/dashboard/settings/page.tsx`
- Behavior:
  - Start flow creates one-time state and returns Auth0 authorize URL.
  - Callback validates state, exchanges code, verifies token, upserts identity, consumes state.
  - Link status and unlink are owner-session gated.

### 5) Canonical MCP tool metadata hardening

- Updated `packages/analogresearch-mcp/src/tools.ts`:
  - Ensures every canonical tool has full annotations:
    - `readOnlyHint`
    - `openWorldHint`
    - `destructiveHint`
  - Adds per-tool `securitySchemes`.
  - Mirrors `securitySchemes` into `_meta.securitySchemes` for compatibility clients.
  - Adds open-world classification wrappers for external provider/talent-network operations.
- Updated MCP SDK package parity:
  - `packages/analogresearch-mcp/package.json` now matches `@modelcontextprotocol/sdk` version used by web app (`^1.26.0`).

### 6) Tests added/updated

- Added:
  - `tests/web/lib/mcp/tool-metadata-parity.test.ts`
  - `tests/web/lib/api-auth.oauth.test.ts`
  - `tests/web/api/mcp/oauth-protected-resource.test.ts`
- Updated:
  - `tests/web/api/mcp/endpoints.test.ts`
  - `tests/web/proxy.test.ts`
- Coverage includes:
  - OAuth metadata endpoint payload.
  - Unauthorized MCP OAuth challenge headers.
  - `authenticateAgent` OAuth fallback path.
  - Per-tool metadata/security scheme parity.
  - Proxy interception/rewrite behavior for well-known OAuth resource metadata URL.

### 7) Environment + docs contract

- Updated `apps/web/.env.local.example` with:
  - `MCP_OAUTH_ENABLED`
  - `MCP_OAUTH_PROVIDER`
  - `MCP_OAUTH_ISSUER`
  - `MCP_OAUTH_AUDIENCE`
  - `MCP_OAUTH_RESOURCE`
  - `MCP_OAUTH_SCOPES_READ`
  - `MCP_OAUTH_SCOPES_WRITE`
  - `AUTH0_MCP_LINK_CLIENT_ID`
  - `AUTH0_MCP_LINK_CLIENT_SECRET`
- Updated docs:
  - `README.md`
  - `docs/architecture/auth-flow.md`
- Included ChatGPT redirect allowlist requirements:
  - `https://chatgpt.com/connector_platform_oauth_redirect`
  - `https://platform.openai.com/apps-manage/oauth`

## Spec-Compliance Audit Note

- Updated: `.codex/ralph-audit/audit/SPEC-COMPLIANCE-FINDINGS.md`
- Added dedicated section for this phase with Apps SDK auth/metadata/annotation references and Context7 checks.

## Verification Status

- Targeted MCP/OAuth/proxy tests: passed.
- Full `pnpm verify`: pending final execution in this working pass.

