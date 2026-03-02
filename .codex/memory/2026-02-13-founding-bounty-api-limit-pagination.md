# Founding Bounty Reconcile: API Limit Must Be <= 100

## Context

Running `pnpm bounties:post:analogresearch` failed while listing existing bounties via the public API:

- Error: `limit must be an integer between 1 and 100`

## Root Cause

`scripts/founding-bounties/post-analogresearch.mjs` queried:

- `GET /v1/bounties?limit=200`

The public bounties API enforces a hard upper bound of `100`.

## Fix

Use paginated listing with:

- `limit=100`
- `offset` increments in a loop until fewer than `100` rows are returned

This preserves idempotent reconciliation behavior and avoids API validation failures.

## Validation

- First run created/reconciled founding lanes successfully.
- Second run returned unchanged/no-op for all four lanes (idempotent).
