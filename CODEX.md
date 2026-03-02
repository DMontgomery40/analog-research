# Codex Execution Notes (Analog Research)

This file is the Codex-facing companion to `CLAUDE.md` and `AGENTS.md`.

## Non-Negotiables

1. Production is live and moves real money.
2. Payer/payee split is strict:
   - ResearchAgent pays (Checkout/PaymentIntent)
   - Human receives payout (Stripe Connect/Crypto wallet)
3. Do not stop at local-only confidence for money/schema/auth changes.

## Required Gates Before Declaring Done

Run from repo root:

```bash
pnpm verify
```

The quality stack includes:
- `check:no-mock-tests`
- `check:risk-tests`
- `check:remote-schema-parity`
- `check:live-money-flow`

## Test Reality Policy

- Tracked tests should not use fake-test primitives (`vi.mock`, `vi.fn`, `mockResolvedValue`, etc.).
- Prefer assertions against deployed API behavior when validating production-critical flows.
- Local mocks can hide production regressions and are treated as debt to eliminate.

## Production Rollout Checklist (Schema + Env)

1. Push code to `main`.
2. Apply required DB migrations (`pnpm db:push` with production target).
3. Ensure required Netlify env vars are set for production.
4. Trigger/confirm production deploy.
5. Smoke-test live endpoints.

## Active Remediation Program

Real-test conversion loop lives in:

- `scripts/ralph-real-test-remediation/README.md`
- `scripts/ralph-real-test-remediation/CODEX.md`
- `scripts/ralph-real-test-remediation/prd.json`

