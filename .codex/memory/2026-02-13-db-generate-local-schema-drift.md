# DB generate local schema drift (2026-02-13)

## Context
Running `pnpm db:generate` executes `supabase gen types typescript --local > packages/database/src/types.ts`.

On this branch, staged migration/state included newer fields (for example `agents.owner_human_id`, payment/preferred fields, proof review mode aliases), but the local Supabase instance on `localhost:5432` was behind that staged schema.

## Symptom
`packages/database/src/types.ts` was regenerated with **regressions**:
- Removed staged fields/types that already existed in branch code.
- Removed compatibility aliases at the bottom of the type file.

## Safe handling
1. Run `pnpm db:generate` as required by workflow.
2. Immediately diff `packages/database/src/types.ts` against staged/index version.
3. If local schema is behind, restore staged content and apply only the intended incremental typing changes for new migration work.
4. Avoid `supabase db push` unless intentionally targeting a safe local/dev project.

## Why this matters
Blindly accepting the regenerated file can break type safety and silently undo in-branch schema work.
