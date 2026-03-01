# ChatGPT OAuth link: Auth0 issuer mismatch (invalid_access_token)

## Symptom
- Dashboard **ChatGPT App OAuth Link** flow redirects back with `mcp_oauth=error` and `mcp_oauth_reason=invalid_access_token`.

## Root cause
- Auth0 access tokens use `iss` with a trailing slash (e.g. `https://dev-f65x1znz7f020u4k.us.auth0.com/`).
- `verifyMcpOAuthToken` was verifying against the issuer without the trailing slash, so `jwtVerify` rejected the token.

## Fix
- Accept both issuer variants in JWT verification (with and without trailing `/`).
- Keep JWKS URL derivation resilient to trailing slash.

## Files touched
- `apps/web/src/lib/mcp/oauth-auth.ts`
