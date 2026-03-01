# ChatGPT MCP local admin fallback (2026-02-13)

## Context
- Testing ChatGPT Developer Mode MCP tools locally required repeated OAuth linking before any tool call would authenticate.
- For local iteration, developers wanted `.env` credentials to work immediately without changing ChatGPT request headers.

## Change
- Added local-only fallback in `apps/web/src/lib/mcp/chatgpt-server.ts`.
- If a request to `/api/v1/mcp/chatgpt` has no `Authorization` or `X-API-Key`, the server now tries:
  1. `MCP_CHATGPT_ADMIN_API_KEY`
  2. `ANALOGLABOR_API_KEY`
- Fallback is disabled in `production` (`NODE_ENV === 'production'`), preserving normal OAuth/API-key behavior for live traffic.

## Why
- Keeps production auth semantics unchanged.
- Gives deterministic local testing for ChatGPT connector calls while still applying existing scope and rate-limit checks through `authenticateAgent`.

## Gotchas
- This fallback does not replace OAuth linking for production usage.
- If ChatGPT sends any auth token/header, fallback is not used (explicit auth always wins).
