# Timezone weekday parsing + cents validation

## Problem

- `Intl.DateTimeFormat(..., { weekday: 'narrow' })` returns localized strings like `"M"`, not a numeric weekday index.
- Converting that result with `parseInt(...)` produces `NaN`, which can silently fall back to server-local time/day logic.
- Stripe `unit_amount` (cents) must be an integer; accepting floats for booking amounts leads to runtime errors or inconsistent rounding.

## Fix pattern

- For “day in timezone”, format a stable weekday string and map it to your schedule keys:
  - Use `weekday: 'short'` + `toLowerCase().slice(0, 3)` and map `sun|mon|...` → `sunday|monday|...`.
  - Keep a safe fallback to `new Date().getDay()` when the timezone is invalid.

- For Stripe-backed amounts in cents:
  - Validate request bodies with integer constraints (e.g. `z.number().int().positive()`).
  - Prefer rejecting invalid input over rounding client-provided floats.

