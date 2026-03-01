# 2026-02-13 Cross-Rail Auto-Bridge Future Plan (Deferred)

## Decision
Cross-rail payout bridging is **deferred** for this release. No automatic conversion/bridging between Stripe-funded and crypto-funded escrow was shipped.

## Current contract (enforced)
- Bounty can set `preferred_payment_method` (`stripe` or `crypto`).
- Booking funding rail must match bounty rail when preference is set.
- Funding endpoint rejects mismatch with HTTP 409.
- UI/API expose payment rail so workers can evaluate compatibility before applying.

## Why deferred
- Bridge introduces FX/custody/compliance/accounting complexity that is high risk for production money movement.
- Existing webhook idempotency and settlement logic are rail-specific; cross-rail conversion would need new atomicity and reconciliation controls.
- Shipping explicit rail visibility + hard mismatch protection closes immediate user-harm risk without introducing new payout risk.

## Future architecture (candidate)
1. Add explicit bridge intent state (`bridge_pending`, `bridge_failed`, `bridge_settled`) on settlement records.
2. Introduce deterministic conversion quote + expiry object captured at approval time.
3. Add bridge executor with strict idempotency keys and replay-safe compensation steps.
4. Write per-rail ledger entries for source debit, conversion fee, destination credit, and residual handling.
5. Add operator controls + audit logs for manual intervention paths.
6. Add worker compatibility pre-check at application time (hard block, not post-hoc warning).

## Preconditions before implementation
- Finance/compliance sign-off on supported geographies and assets.
- Deterministic accounting model accepted by ops.
- Load-tested webhook retry/idempotency behavior for conversion provider outages.
- Full simulation tests for partial-failure compensation across all transitions.
