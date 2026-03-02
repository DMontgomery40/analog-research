# ChatGPT App (Developer Mode) OAuth Setup — Analog Research

## Purpose
Ship a working ChatGPT Developer Mode app backed by the Analog Research MCP server, using OAuth with Auth0 (or another OIDC provider) and avoiding the common DCR/OAuth misconfigurations.

## Related memory
- `../../.codex/memory/2026-02-14-chatgpt-app-oauth-setup.md`

## OpenAI requirements (from current docs)
- MCP server must host protected-resource metadata at `/.well-known/oauth-protected-resource`.
- Each tool should declare `securitySchemes`; ChatGPT will only show the OAuth link UI when the server both publishes metadata and returns `_meta["mcp/www_authenticate"]` errors.
- OAuth redirect allowlist must include:
  - `https://chatgpt.com/connector_platform_oauth_redirect`
  - `https://platform.openai.com/apps-manage/oauth`
- OAuth credentials:
  - If **static client credentials** are provided in ChatGPT, those are used.
  - If not, ChatGPT falls back to **dynamic client registration (RFC 7591)**.
- Authentication modes: `OAuth`, `No Auth`, and `Mixed`. Mixed enables unauthenticated `initialize`/`tools/list` while requiring OAuth for tool calls based on `securitySchemes`.

## Production endpoints and identifiers
- MCP server URL: `https://api.analog-research.org/v1/mcp/chatgpt`
- Protected resource metadata: `https://api.analog-research.org/.well-known/oauth-protected-resource`
- OAuth resource/audience identifier: `https://api.analog-research.org`
- Auth0 issuer: `https://dev-f65x1znz7f020u4k.us.auth0.com`

## Auth0 configuration
1. Allowlist the ChatGPT redirect URIs listed above in the Auth0 application.
2. Ensure the API identifier (audience) matches `https://api.analog-research.org`.
3. If you are **not** using DCR, use the Auth0 client ID/secret as static credentials in ChatGPT.

## Dashboard OAuth link prerequisites (owner → ResearchAgent)
- Production migrations applied:
  - `packages/database/supabase/migrations/037_owner_identity_payment_preferences_and_proof_mode.sql`
  - `packages/database/supabase/migrations/039_mcp_oauth_identity_linking.sql`
- Required DB objects exist:
  - `agents.owner_human_id` (FK to `humans.id`)
  - `current_owner_agent_ids()` function
  - `mcp_oauth_identities` + `mcp_oauth_link_states` tables
- Netlify env (production) includes:
  - `MCP_OAUTH_ENABLED=true`
  - `MCP_OAUTH_ISSUER=https://dev-f65x1znz7f020u4k.us.auth0.com`
  - `MCP_OAUTH_AUDIENCE=https://api.analog-research.org`
  - `MCP_OAUTH_RESOURCE=https://api.analog-research.org`
  - `AUTH0_MCP_LINK_CLIENT_ID` + `AUTH0_MCP_LINK_CLIENT_SECRET`
  - `ADMIN_EMAILS` includes the dashboard owner email (e.g. `dmontg@gmail.com`)

## Dashboard OAuth link flow (owner → ResearchAgent)
1. Go to `https://analog-research.org/dashboard/settings`.
2. In **ChatGPT App OAuth Link**, click **Link in Auth0**.
3. Complete Auth0 login/consent.
4. Status flips to **Linked** and the OAuth identity is stored in `mcp_oauth_identities`.

## ChatGPT app creation (Developer Mode)
1. Settings → Apps → Advanced settings → enable Developer mode.
2. Click **Create app**.
3. Fill:
   - Name: `Analog Research`
   - MCP Server URL: `https://api.analog-research.org/v1/mcp/chatgpt`
   - Authentication: `Mixed`
4. If you select `OAuth` and your IdP does **not** support DCR, paste the static **client ID** and **client secret**.
5. Acknowledge the risk checkbox and click **Create**.

## OAuth link verification
1. Open a ChatGPT conversation.
2. Select **Developer mode** and choose the Analog Research app.
3. Call a protected tool (e.g. `list_bounties`) to trigger OAuth.
4. Complete the OAuth prompt and verify you can call tools successfully.
5. Optional: confirm the link in the dashboard settings.

## Troubleshooting
- **“MCP server does not implement OAuth”**
  - `https://api.analog-research.org/.well-known/oauth-protected-resource` must return JSON.
  - Ensure `MCP_OAUTH_ENABLED=true` and redeploy.
- **“server doesn’t support RFC 7591 Dynamic Client Registration”**
  - Provide **static client ID/secret** in ChatGPT, or enable DCR in your IdP.
- **“Cannot connect” (no error code)**
  - Ensure `resource` in metadata matches the Auth0 API identifier (audience).
- **Dashboard shows `invalid access token` after linking**
  - Auth0 `iss` typically includes a trailing `/`, while token verification may be configured without it.
  - Accept both issuer variants during JWT verification (see `apps/web/src/lib/mcp/oauth-auth.ts`) or align `MCP_OAUTH_ISSUER` with the exact issuer from OIDC discovery.
- **“Widget domain is not set for this template”**
  - Set `MCP_WIDGET_DOMAIN` (or `NEXT_PUBLIC_SITE_URL`) and redeploy.

## Verification commands
```bash
curl -sS https://api.analog-research.org/.well-known/oauth-protected-resource | jq
```
Expected: `resource` is `https://api.analog-research.org` and `authorization_servers` includes the Auth0 issuer.

```bash
curl -sS -X POST https://api.analog-research.org/v1/mcp/chatgpt \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":"smoke-auth","method":"tools/call","params":{"name":"list_bounties","arguments":{"limit":1}}}' | jq
```
Expected: 401-style tool error with `_meta["mcp/www_authenticate"]` pointing to the protected-resource metadata URL.

```bash
curl -sS https://analog-research.org/api/v1/mcp/oauth/link | jq
```
Expected: `success=true` and `data.linked=true` after the dashboard OAuth link completes.
