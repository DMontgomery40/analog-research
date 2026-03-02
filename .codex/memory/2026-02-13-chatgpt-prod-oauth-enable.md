# ChatGPT MCP production OAuth enablement (2026-02-13)

## Symptom
ChatGPT Developer Mode shows: `MCP server ... does not implement OAuth`.

## Root cause
`MCP_OAUTH_ENABLED` (and related OAuth env vars) are not set in Netlify production, so `/.well-known/oauth-protected-resource` returns 404 with `MCP OAuth is not configured`.

## Fix
Set Netlify prod env for `@analogresearch/web`:
- `MCP_OAUTH_ENABLED=true`
- `MCP_OAUTH_ISSUER`, `MCP_OAUTH_AUDIENCE`, `MCP_OAUTH_RESOURCE`
- `MCP_OAUTH_SCOPES_READ`, `MCP_OAUTH_SCOPES_WRITE`
- `AUTH0_MCP_LINK_CLIENT_ID`, `AUTH0_MCP_LINK_CLIENT_SECRET`

Then trigger a production deploy so runtime uses the new env.

## Verification
- `https://api.analog-research.org/.well-known/oauth-protected-resource` returns RFC9728 metadata
- ChatGPT app uses `https://api.analog-research.org/v1/mcp/chatgpt` with `Mixed` auth
- Protected tool call prompts OAuth and succeeds after linking
