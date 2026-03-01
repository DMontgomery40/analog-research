# ChatGPT Developer Mode Smoke Runbook (MCP ChatGPT Endpoint)

## Purpose
Validate that the private ChatGPT connector for AnalogLabor is operational, correctly authenticated, and stable before broader beta rollout.

## Scope
This runbook validates:

1. MCP connector discovery and tools listing.
2. OAuth challenge behavior for protected tools.
3. Dashboard link/unlink flows.
4. Read and write tool execution behavior.
5. Widget resource rendering and connector metadata refresh behavior.

## Preconditions

1. `pnpm verify` passes on the target commit.
2. OAuth env contract is configured (see `docs/architecture/auth-flow.md`).
3. Auth0 app allowlist includes:
   - `https://chatgpt.com/connector_platform_oauth_redirect`
   - `https://platform.openai.com/apps-manage/oauth`
4. Connector endpoint to test:
   - `https://api.analoglabor.com/v1/mcp/chatgpt`
5. Protected resource metadata endpoint:
   - `https://api.analoglabor.com/.well-known/oauth-protected-resource`

## Test data and safety notes

1. Use a dedicated internal owner account + Molty for this pass.
2. Prefer read-only tools first.
3. For write-tool smoke, use non-financial low-risk actions when possible.
4. Do not test irreversible payment flows on production records unless explicitly approved.

## Step-by-step checks

### 1) Metadata contract check (HTTP)

```bash
curl -s https://api.analoglabor.com/.well-known/oauth-protected-resource | jq
```

Expected:

1. `resource` equals `https://api.analoglabor.com/api/v1/mcp/chatgpt`.
2. `authorization_servers` includes the expected Auth0 issuer.
3. `scopes_supported` includes `analoglabor.read` and `analoglabor.write`.

### 2) Unauthenticated discovery check (HTTP)

```bash
curl -sS -X POST https://api.analoglabor.com/v1/mcp/chatgpt \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"smoke-tools-list","method":"tools/list"}' | jq
```

Expected:

1. Request succeeds.
2. Tool list contains canonical tools and tool-level `securitySchemes`.

### 3) Unauthenticated protected-tool challenge check (HTTP)

```bash
curl -sS -X POST https://api.analoglabor.com/v1/mcp/chatgpt \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"smoke-auth-challenge","method":"tools/call","params":{"name":"list_bounties","arguments":{"limit":1}}}' | jq
```

Expected:

1. Tool result is error.
2. `_meta["mcp/www_authenticate"]` exists.
3. Challenge includes `resource_metadata="https://api.analoglabor.com/.well-known/oauth-protected-resource"`.

### 4) Add connector in ChatGPT Developer Mode

In ChatGPT:

1. Open Developer Mode and add connector using `https://api.analoglabor.com/v1/mcp/chatgpt`.
2. Confirm connector appears and tool catalog loads.

Expected:

1. Connector saves successfully.
2. Tool discovery is visible in chat.

### 5) Link account through OAuth

1. Invoke a protected tool from ChatGPT (for example `list_bounties`).
2. Complete OAuth link flow.
3. In dashboard session, verify link status endpoint:

```bash
curl -sS https://analoglabor.com/api/v1/mcp/oauth/link \
  -H "Cookie: <dashboard-session-cookie>" | jq
```

Expected:

1. OAuth prompt appears in ChatGPT.
2. Link flow returns to success state.
3. Status endpoint reports linked state.

### 6) Read-tool success + widget render

1. Run a read tool (`browse_humans` or `list_bounties`).
2. Confirm response returns structured data and renders widget template.

Expected:

1. Tool call succeeds.
2. Widget renders (not text-only fallback) for tools with `_meta.ui.resourceUri`.

### 7) Write-tool behavior check

1. Run a write tool with test-safe payload (for example `start_conversation` with a test human).
2. Confirm expected confirmation and execution behavior.

Expected:

1. Write tool is clearly treated as mutating/destructive based on annotations.
2. Tool succeeds only with sufficient scope.

### 8) Unlink and revocation behavior

1. Unlink from dashboard settings or API (`DELETE /api/v1/mcp/oauth/link`).
2. Re-run protected tool from ChatGPT.

Expected:

1. Protected call fails.
2. OAuth challenge metadata is returned again.

### 9) Connector metadata refresh behavior

1. Bump one test widget URI version in non-production branch.
2. Refresh connector metadata in ChatGPT.
3. Re-run tool mapped to updated URI.

Expected:

1. Updated widget/template is used.
2. No stale template URI behavior after refresh.

## Evidence template

Record one row per step during execution.

| Step | Expected | Actual | Pass/Fail | Evidence |
|---|---|---|---|---|
| Metadata contract | `resource` + issuer + scopes correct |  |  | curl output/screenshot |
| Unauth discovery | `tools/list` succeeds |  |  | transcript |
| Unauth challenge | `mcp/www_authenticate` present |  |  | transcript |
| Connector add | connector saves in Dev Mode |  |  | screenshot |
| OAuth link | prompt + success + linked status |  |  | screenshot + API response |
| Read tool | success + widget render |  |  | screenshot |
| Write tool | correct confirmation + success |  |  | screenshot/transcript |
| Unlink | protected tools blocked post-unlink |  |  | screenshot/transcript |
| Metadata refresh | new widget URI served after refresh |  |  | screenshot/transcript |

## Run summary block

```md
Smoke run date: YYYY-MM-DD
Executor: <name/email>
Environment: <dev/staging/prod>
Commit SHA: <sha>
Connector URL: https://api.analoglabor.com/v1/mcp/chatgpt
Result: PASS | FAIL
Blocking issues:
- <issue 1>
- <issue 2>
```

## Exit criteria

1. All steps pass, or all failures are documented with severity and owner.
2. Any auth/scope mismatch is treated as blocking.
3. Any missing challenge metadata on protected-tool failure is blocking.
4. Any widget non-render for mapped tools is blocking.
