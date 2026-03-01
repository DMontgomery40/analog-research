# Memory audit: superseded and contradictory entries (2026-02-13)

## Scope
- Audited `.codex/MEMORY.md` and all notes under `.codex/memory/`.
- Checked for stale implementation references and identity/auth flow contradictions.

## Findings
1. `2026-02-08-authenticated-browse-molty-inbox.md` described owner-Molty resolution primarily via legacy naming (`agents.name = human_<human_id>`), while current behavior is FK-first via `agents.owner_human_id` with legacy fallback/backfill.
2. `2026-02-08-new-user-funnel-confirm-and-api-key.md` documented `apps/web/src/app/auth/callback/route.ts`, but current auth flow uses `apps/web/src/app/auth/callback/page.tsx` plus `apps/web/src/app/auth/callback/complete/route.ts`.

## Actions taken
- Split memory index into:
  - Active entries
  - Superseded entries (historical context only)
- Marked both stale notes with explicit `Status: Superseded` headers and pointers to canonical replacement notes.

## Ongoing rule
- When an implementation changes enough to invalidate an older note, keep the old note only as historical context and move it to the superseded section in `.codex/MEMORY.md`.
