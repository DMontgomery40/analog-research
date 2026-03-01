# Webhook retry lock + Stripe manual transfer idempotency

## Context

Two P1 money-safety bugs were fixed in production payment infrastructure:

1. `acquireWebhookLock` could return `action: 'retry'` even when the retry CAS update matched zero rows during an `error -> processing` race.
2. `releaseEscrowAndTransfer` could capture a Stripe PaymentIntent before verifying payout preconditions for manual transfer flows, and retries on `pi.status === 'succeeded'` could re-attempt manual transfer without deterministic idempotency.

## Fix pattern

- Webhook retry lock now uses `update(...).eq(status, 'error').select(...).maybeSingle()` and only returns `retry` when a row is actually updated.
- Stripe release path now:
  - checks manual-transfer payout readiness **before capture** when `status === requires_capture` and no `transfer_data.destination`
  - supplies a deterministic idempotency key (`al_escrow_transfer_<bookingId>`) to `stripe.transfers.create` for manual transfer retries.

## Regression tests

- `tests/web/lib/webhook-idempotency.test.ts`
  - verifies race case returns `skip_duplicate` when CAS update updates zero rows
  - verifies `retry` only when CAS update succeeds
- `tests/web/lib/stripe-release-and-transfer.test.ts`
  - verifies pre-capture guard blocks capture when payout preconditions missing
  - verifies deterministic transfer idempotency key on `status === succeeded`
  - verifies auto-transfer flow bypasses manual-transfer guard
