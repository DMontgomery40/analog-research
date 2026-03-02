# Testing + Stop Hook Runbook

This repository now enforces a single quality gate stack for humans and agents:

- **Context7 gate** (stop hook only): blocks agent stop until spec-compliance checks are documented for any changes anywhere in the codebase. See `.claude/hooks/README-CONTEXT7-GATE.md`.
- `check:ai-slop` (detects likely “new file instead of reuse” and renamed duplicated function bodies)
- `check:hardcoded` (secret-like literals + forbidden hardcoded assignments)
- `check:duplicates` (duplicate-code detection via `jscpd`)
- `check:no-mock-tests` (forbids fake test primitives in tracked suites)
- `check:risk-tests` (requires generalized invariant tests for high-risk changes)
- `check:remote-schema-parity` (ensures required production tables/columns are present)
- `check:live-money-flow` (ensures live payment invariants remain intact)
- `lint`
- `typecheck`
- `test` (Vitest)
- `build` (always in full mode, only for build-impacting changes in changed mode)

All checks run through:

```bash
.claude/hooks/run-quality-gates.sh --changed
```

## Commands

From repo root:

```bash
pnpm test
pnpm test:coverage
pnpm check:ai-slop --changed
pnpm check:hardcoded --changed
pnpm check:duplicates --changed
pnpm check:no-mock-tests
pnpm check:risk-tests
pnpm check:remote-schema-parity
pnpm check:live-money-flow
pnpm verify
pnpm verify:changed
```

- `pnpm verify` runs full gates (`lint`, `typecheck`, `test`, `build`).
- `pnpm verify:changed` runs the same gates but skips `build` unless changed files impact runtime/build output.

## Install Hooks (Recommended)

```bash
bash scripts/install-stop-hooks.sh
```

This installs:

- `.git/hooks/pre-commit` -> `run-quality-gates.sh --changed`
- `.git/hooks/pre-push` -> `run-quality-gates.sh --full`
- `.claude/hooks/verify-analogresearch.sh` (plus `.claude/settings.json` if missing)
- Context7 MCP in Cursor (`.cursor/mcp.json`) and Codex (`~/.codex/config.toml`)

## Claude Stop Hook

Hook entrypoint:

```bash
.claude/hooks/verify-analogresearch.sh
```

This delegates to:

```bash
.claude/hooks/verify-stop.sh
```

`verify-stop.sh` (in `.claude/hooks/`) runs **Context7 gate** first (blocks if any changes lack documented Context7 checks), then `run-quality-gates.sh --changed`.

## Codex Stop/Notify Hook

Use this script as your project stop-hook entrypoint:

```bash
.claude/hooks/verify-stop.sh
```

If a JSON payload is provided (Codex notify hooks), non-terminal events are ignored and terminal turn events run `--changed` gates.

## Notes

- `pnpm test` currently targets `@analogresearch/web` tests through Turbo.
- Unit/integration tests are centralized under `tests/web/**/*.test.ts`.
- Add `ai-slop-ok` in a file only when a flagged pattern is intentional and reviewed.
- Local-only or mock-only checks are not sufficient for production money/schema changes.
- If `check:no-mock-tests` reports violations, treat as correctness debt, not lint noise.
