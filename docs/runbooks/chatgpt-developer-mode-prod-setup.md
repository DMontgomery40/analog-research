# ChatGPT Developer Mode (Production OAuth Enablement)

## Purpose
Make the production ChatGPT MCP app work end-to-end by enabling OAuth discovery + linking and ensuring the correct connector URL and auth mode are used.

## When to use
- ChatGPT shows: `MCP server ... does not implement OAuth`
- OAuth metadata endpoint returns `MCP OAuth is not configured`
- Tools list works but protected calls fail to prompt OAuth

## Requirements
- OAuth 2.1 / OIDC authorization server with PKCE (S256) and discovery metadata
- Dynamic Client Registration (RFC 7591) is **optional** if you provide static client credentials in the ChatGPT app. It is required only when those fields are left blank.
- Auth0 callback allowlist includes:
  - `https://chatgpt.com/connector_platform_oauth_redirect`
  - `https://platform.openai.com/apps-manage/oauth`
- Dedicated owner account + Molty for testing
- Auth0 Tenant Settings → Advanced:
  - Enable **Dynamic Client Registration (DCR)** only if you plan to leave ChatGPT's OAuth client fields blank
  - Enable **Resource Parameter Compatibility Profile** (so `resource` works when `audience` isn't sent)
- Widget templates must set `_meta.ui.domain` (unique per app) for app submission.

## OpenAI MCP auth requirements (verified 2026-02-13)
- Serve `/.well-known/oauth-protected-resource` on the MCP host (or advertise it via `WWW-Authenticate`) with `resource`, `authorization_servers`, and `scopes_supported`.
- Authorization server must publish OAuth/OIDC discovery metadata and include `registration_endpoint` for DCR.
- `code_challenge_methods_supported` must include `S256` (PKCE required).
- Echo the `resource` param through auth + token exchange; ensure access tokens include the expected audience.

## Current production values (2026-02-13)
- Auth0 tenant (issuer): `https://dev-f65x1znz7f020u4k.us.auth0.com`
- Auth0 API identifier (audience): `https://api.analoglabor.com`
- MCP server URL (recommended): `https://api.analoglabor.com/v1/mcp/chatgpt` (rewrites to `/api/v1/mcp/chatgpt`)
- Resource metadata `resource` matches the Auth0 API identifier (use `https://api.analoglabor.com`)
- Auth0 app (client) ID: `ctmI2ffC3hd1cfHafEZuXRgG8MYdLwf4`
- Client secret is stored in Netlify as a secret and must never be committed
- These client credentials can be used as **static credentials** in the ChatGPT app to avoid RFC 7591 DCR errors.

## Production env contract (Netlify)
Set these on the `@analoglabor/web` site in Netlify `production` context:

- `MCP_OAUTH_ENABLED=true`
- `MCP_OAUTH_PROVIDER=auth0`
- `MCP_OAUTH_ISSUER=https://<tenant>.auth0.com`
- `MCP_OAUTH_AUDIENCE=https://api.analoglabor.com`
- `MCP_OAUTH_RESOURCE=https://api.analoglabor.com` (must match Auth0 API identifier for `resource` parameter)
- `MCP_OAUTH_SCOPES_READ=analoglabor.read`
- `MCP_OAUTH_SCOPES_WRITE=analoglabor.write`
- `AUTH0_MCP_LINK_CLIENT_ID=<client id>`
- `AUTH0_MCP_LINK_CLIENT_SECRET=<client secret>`

Optional but recommended for canonical URLs:
- `NEXT_PUBLIC_APP_URL=https://analoglabor.com`
- `NEXT_PUBLIC_SITE_URL=https://analoglabor.com`

## Deploy
Netlify env changes require a new deploy to take effect. Trigger a production deploy after setting env vars.

## Verification (HTTP)
Run these from any shell:

```bash
curl -sS https://api.analoglabor.com/.well-known/oauth-protected-resource | jq
```

Expected:
- `resource` is `https://api.analoglabor.com`
- `authorization_servers` includes your Auth0 issuer
- `scopes_supported` includes `analoglabor.read` and `analoglabor.write`

```bash
curl -sS -X POST https://api.analoglabor.com/v1/mcp/chatgpt \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":"smoke-tools-list","method":"tools/list"}' | jq
```

Expected:
- Tool list returns with per-tool `securitySchemes`

```bash
curl -sS -X POST https://api.analoglabor.com/v1/mcp/chatgpt \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":"smoke-auth","method":"tools/call","params":{"name":"list_bounties","arguments":{"limit":1}}}' | jq
```

Expected:
- Tool call fails with auth error
- `_meta["mcp/www_authenticate"]` includes `resource_metadata="https://api.analoglabor.com/.well-known/oauth-protected-resource"`
Note: If `Accept: text/event-stream` is missing you'll get `406 Not Acceptable`.

## ChatGPT App setup (Developer Mode)
In ChatGPT (Developer Mode enabled):

1. Create new app
2. MCP server URL: `https://api.analoglabor.com/v1/mcp/chatgpt`
3. Authentication: `Mixed`
4. If you choose `OAuth` and your IdP does not support DCR, paste the static client ID + secret here (Auth0 client credentials)

Why Mixed:
- `initialize` and `tools/list` are unauthenticated
- tool calls enforce OAuth scopes based on tool `securitySchemes`

## OAuth linking (required)
OAuth identity must exist before tools can run.

1. In ChatGPT, run a protected tool (e.g., `list_bounties`)
2. Complete the OAuth prompt
3. Verify link in dashboard settings

Server-side identity is stored in `mcp_oauth_identities`.

## Failure modes
- `MCP OAuth is not configured`: env not set or deploy not updated
- OAuth prompt never appears: using wrong URL or auth mode (must be `Mixed`)
- `invalid_token` after OAuth: issuer/audience mismatch or missing `resource` echo

## Related memory
- `.codex/memory/2026-02-13-chatgpt-app-phase-1-implementation-plan.md`
- `.codex/memory/2026-02-13-chatgpt-prod-oauth-enable.md`
