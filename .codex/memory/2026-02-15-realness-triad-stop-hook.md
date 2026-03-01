# Realness Triad Stop Hook (2026-02-15)

## Problem
- "Integration" tests can still be fake if they only check local handlers or never prove real provider/runtime wiring.

## Heuristic turned into a hard gate
- Add `pnpm check:realness` and run it in quality gates + Ralph completion checks.
- `check:realness` enforces all 3 signals in one pass:
  1. **Netlify runtime signal**: deployed API probe must return `x-nf-request-id`.
  2. **Supabase signal**: remote REST/schema parity probes must pass.
  3. **Stripe signal**: real Stripe transfer canary + reversal must pass.

## Why this is stronger
- Prevents local-only test success from being treated as production-safe.
- Fails closed if env points to localhost or if any external system is not truly reachable.
