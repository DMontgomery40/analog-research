# Risk-Invariant Test Gate for High-Risk Flows (2026-02-15)

## Problem

Route/unit tests had become narrowly bug-shaped (single scenario per regression), which let new variants of the same failure class ship when code changed around those exact conditions.

## Decision

Add a quality gate that enforces **generalized test coverage** whenever high-risk domains are changed:

- Script: `scripts/quality/check-risk-invariants.mjs`
- Hooked into verify pipeline: `.claude/hooks/run-quality-gates.sh` via `pnpm check:risk-tests`
- Command: `check:risk-tests` in root `package.json`

## Heuristic Enforced

When changed files touch high-risk domains (`payments/bookings/webhooks`, `auth/session`, `notification delivery`), the patch must include:

1. Domain-relevant tests in `tests/web/**`
2. At least one generalized test file whose name hints broad coverage
   (`invariant|matrix|state|property|fuzz|idempotency`)

If not, quality gate fails with touched-domain and missing-test details.

## Baseline Generalized Coverage Added

- `tests/web/api/bookings/complete.invariant.unit.test.ts`

This suite verifies cross-rail and failure-injection invariants for booking completion:
- no capture/release before state preconditions
- compensation on transition failure after capture
- idempotent success when concurrent transition already completed

## Why this matters

This shifts test strategy from “regression snapshots” to “failure-class invariants,” reducing repeat production bugs caused by slight implementation drift.
