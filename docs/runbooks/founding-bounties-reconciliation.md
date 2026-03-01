# Founding Bounties Reconciliation Runbook

Use this runbook to keep the public "founding partner" bounty set at exactly four open entries while preserving public brand copy on the homepage.

## Invariants
- Homepage (`/`) must contain the safety-first hero and four founding partner cards.
- Public bounties API must expose exactly four founding bounties:
  - Legal
  - Security
  - DevOps
  - Marketing

## Verify
```bash
curl -sS 'https://698824d9a79ee45df5c01b8b--analoglabor-api.netlify.app/' \
  | rg -n "Founding Equity Is Dedicated|Legal Partner|Security Partner|DevOps Partner|Marketing Partner"

curl -sS 'https://698824d9a79ee45df5c01b8b--analoglabor-api.netlify.app/api/v1/bounties?limit=100' \
  | jq '.pagination.total, (.data | length), (.data | map(.title))'

curl -sS 'https://698824d9a79ee45df5c01b8b--analoglabor-api.netlify.app/bounties' \
  | rg -n "Open Bounties|Founding Legal Partner|Founding Security Partner|Founding DevOps Partner|Founding Marketing Partner"
```

Expected result:
- API total is `4`.
- `/bounties` includes all four founding roles.

## Reconcile if Count < 4
Run the idempotent posting workflow:

```bash
pnpm bounties:post:analoglabor
```

Then rerun the verify commands above.

## Notes
- The posting script reconciles founding entries by role (`track=<role>` in application URL): updates mismatched copy and creates only missing lanes.
- Do not manually delete/replace homepage sections to fix bounty data issues.
