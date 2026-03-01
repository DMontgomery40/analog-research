# Ralph Real Test Remediation Loop

Write-enabled Ralph loop for converting mocked tests into real-system tests.

## Purpose

- Eliminate fake/mock test behavior.
- Force integration tests to use deployed API surfaces.
- Enforce a realness triad gate: deployed Netlify runtime + remote Supabase API + real Stripe canary.
- Track progress in batches so the full conversion can run past context-window limits.

## Run

```bash
cd scripts/ralph-real-test-remediation
./ralph.sh 40 --regen-prd
```

Optional:

- Enable web search for the agent: `./ralph.sh 40 --regen-prd --search`
- Set model: `CODEX_MODEL=gpt-5.2 ./ralph.sh 40 --regen-prd`
- Change files per story batch: `REAL_TEST_BATCH_SIZE=6 ./ralph.sh 40 --regen-prd`

## Files

- `generate-prd.mjs`: builds `prd.json` from current mock violations.
- `prd.json`: batch stories generated from current violation set.
- `CODEX.md`: per-iteration agent contract.
- `progress.txt`: remediation log.
- `ralph.sh`: long-running loop runner.

## Notes

- This loop is write-enabled (`workspace-write`).
- It is intended to run repeatedly until all stories pass and global gates succeed.
- Global completion requires `pnpm check:realness` (Netlify + Supabase + Stripe) in addition to no-mock checks.
