# Ralph loops: use subdirectories, don’t overwrite

This repo uses a “Ralph loop” runner under `scripts/ralph/` to execute long-running autonomous iterations.

## Rule of thumb

Create a new loop under `scripts/ralph-*/` (e.g. `scripts/ralph-audit/`, `scripts/ralph-agentic-parity/`) instead of overwriting `scripts/ralph/prd.json`.

## Why

- Multiple loops can coexist (audit vs implementation vs code review).
- Each loop can have its own `prd.json`, `CLAUDE.md`, and `progress.txt`.
- Avoids clobbering prior runs and makes the workspace safer to operate.

