# Ralph Agent Instructions (OpenAI Codex) — Real Test Remediation

You are an autonomous coding agent running via OpenAI Codex CLI inside the AnalogLabor repo.

## Mission

Make tests real. Remove fake/mock patterns and replace them with assertions against deployed APIs or live provider behavior.

## Hard Requirements

1. Work on exactly one story per iteration.
2. Do not touch unrelated stories.
3. No `vi.mock`, `vi.fn`, `jest.mock`, `mockResolvedValue`, `mockImplementation` in the story files.
4. Use deployed API behavior (`API_BASE_URL` + `fetch(buildUrl(...))`) for integration tests.
5. Never introduce localhost-only integration assumptions.
6. Keep `pnpm check:no-mock-tests` trending toward **0** globally. Current baseline is recorded in `prd.json`.
7. Realness must pass the triad gate:
   - Netlify function runtime (requires `x-nf-request-id` from deployed API).
   - Remote Supabase API/schema parity.
   - Real Stripe API transfer+reversal canary.
8. Shell safety: when referencing Next.js dynamic route paths like `.../[id]/...`, ALWAYS single-quote the path (or escape `[` and `]`) to avoid zsh `nomatch` failures.

## Story Selection

Pick the first incomplete story:

```bash
jq -r '.userStories[] | select(.passes==false) | "\(.id) \(.title)"' scripts/ralph-real-test-remediation/prd.json | head -n 1
```

Then read that story’s `files` list from the PRD.

## Execution Checklist (Per Story)

1. Fix only files in the story `files` list.
2. Convert mocked/fake tests into real tests.
3. Run the batch check:

```bash
node scripts/quality/check-no-mock-tests.mjs --files "<comma-separated-files>"
```

4. Commit changes:

```bash
git add <story-files...> scripts/ralph-real-test-remediation/prd.json scripts/ralph-real-test-remediation/progress.txt
git commit -m "test: [Story ID] - make tests real"
```

5. Mark story as done (`passes: true`) in `scripts/ralph-real-test-remediation/prd.json`.
6. Append a progress entry to `scripts/ralph-real-test-remediation/progress.txt`.

Progress entry format:

```text
## [Date/Time] - [Story ID]
- Files fixed
- What was made real
- Verification:
  - node scripts/quality/check-no-mock-tests.mjs --files "<files>": PASS
---
```

## Completion Condition

When all stories have `passes: true`, run:

```bash
pnpm check:no-mock-tests
pnpm check:realness
pnpm verify
```

If global violations are still non-zero, do not claim completion. Append progress and continue with the next story.

Only if all pass, output:

```text
<promise>COMPLETE</promise>
```
