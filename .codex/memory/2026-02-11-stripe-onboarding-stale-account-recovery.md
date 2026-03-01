# Stripe onboarding stale account recovery

## Context

The dashboard payment settings could show `Failed to create Stripe onboarding link` even for authenticated humans with valid Supabase state.

A key failure mode was stale `humans.stripe_account_id` values pointing to accounts that no longer exist (or belong to a different Stripe environment). Stripe returns `resource_missing` / `No such account`.

## Fix pattern

- In `POST /api/v1/humans/me/stripe-connect`, treat missing-account errors from `createConnectAccountLink` as recoverable.
- Recreate a fresh Connect account, persist the new `stripe_account_id`, then retry onboarding link creation once.
- Keep explicit handling for Connect-not-enabled errors (`STRIPE_CONNECT_NOT_ENABLED`) and return the concrete error message for other failures.

## Regression coverage

- `tests/web/api/humans/stripe-connect.unit.test.ts`
  - unauthenticated request returns 401
  - stale account id triggers account recreation + successful retry
  - Connect-not-enabled returns 503 with `STRIPE_CONNECT_NOT_ENABLED`
