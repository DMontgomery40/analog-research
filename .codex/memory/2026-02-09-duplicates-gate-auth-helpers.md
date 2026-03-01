# Duplicates Gate: Avoid Copy/Paste in API Routes

AnalogLabor runs a strict duplicate-code quality gate (`pnpm check:duplicates --changed`) via stop hooks and `pnpm verify:changed`.

Key behavior:
- `--changed` mode includes **unstaged**, **staged**, and **untracked** files (`git diff`, `git diff --cached`, and `git ls-files --others`).
- The gate fails on **cross-file clones** involving any changed file(s). This can block commits/PRs even if the repo already contains older duplicates elsewhere.

## What To Do Instead

When adding auth + rate limiting to a route, do **not** paste the same “authenticate + scope + rate limit” block into multiple handlers.

Use the shared helpers:
- `apps/web/src/lib/api-auth.ts`: `requireAgentWithScope(request, scope)` for API-key-only routes. This centralizes:
  - agent auth
  - scope checks
  - API-key rate limiting
  - service Supabase client wiring (when needed)
- `apps/web/src/lib/session-or-agent-auth.ts`: `requireSessionOrAgent(request, { agentScope })` for hybrid routes (dashboard session OR API key).

This keeps route handlers short, consistent, and avoids triggering the duplicates gate.

## Docs Gotcha

`apps/web/src/app/api-docs/page.tsx` and `apps/web/src/app/mcp/page.tsx` currently share several duplicated blocks. Touching either file can cause `pnpm check:duplicates --changed` to fail.

If you need to edit these pages, first refactor the shared sections into a single shared component/module and import it from both pages.

