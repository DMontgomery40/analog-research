# ChatGPT MCP resource must match Auth0 API identifier (2026-02-13)

## Symptom
ChatGPT connector shows “Cannot connect” with no error code during OAuth connect.

## Root cause
OAuth `resource` value from `/.well-known/oauth-protected-resource` did not match the Auth0 API identifier (audience). Auth0 rejects `resource` values that don’t map to a registered API.

## Fix
Set `MCP_OAUTH_RESOURCE` to the Auth0 API identifier (same value as `MCP_OAUTH_AUDIENCE`, e.g., `https://api.analog-research.org`). Redeploy so `resource` in metadata matches.
