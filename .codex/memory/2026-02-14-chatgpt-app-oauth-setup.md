# ChatGPT App OAuth setup (static credentials + metadata origin)

## What changed
- Updated `getMcpOauthChallengeHeader` to build `resource_metadata` from `MCP_OAUTH_RESOURCE` (origin) instead of `request.nextUrl.origin`, which prevented Netlify deploy domains from leaking into the OAuth metadata URL.
- Added a dedicated runbook for ChatGPT Developer Mode app setup with explicit guidance on static OAuth credentials vs DCR.

## Why
- OpenAI docs confirm ChatGPT uses **static client credentials** when provided; DCR is only required when those fields are blank.
- Auth0 DCR is often unavailable on lower tiers, so static credentials are the practical path.
- Netlify runtime can surface the deploy domain as the request origin; OAuth challenge headers must point to the stable API host.

## Files touched
- `apps/web/src/lib/mcp/oauth-auth.ts`
- `docs/runbooks/chatgpt-developer-mode-prod-setup.md`
- `docs/runbooks/chatgpt-app-oauth-setup.md`
