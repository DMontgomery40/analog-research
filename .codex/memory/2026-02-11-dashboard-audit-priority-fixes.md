# Dashboard audit priority fixes (Next.js 16 + proof attachment security)

## Context

Applied the highest-priority fixes from `.codex/ralph-audit/audit/05-dashboard-pages.md`.

## Fixes implemented

1. **Field check detail page (`/dashboard/field-checks/[id]`)**
   - Client page no longer reads `params.id` directly from page props.
   - Uses `useParams()` to get route id safely in Next.js 16.
   - Guards missing/invalid id before issuing API requests.

2. **Bookings page (`/dashboard/bookings`)**
   - `searchParams` is now treated as a Promise and awaited in the server page.
   - Pagination now correctly respects `?page=` and `?limit=` in Next.js 16.

3. **Applied bounty compensation display**
   - For `pricing_mode = fixed_per_spot`, display amount now uses `bounties.fixed_spot_amount` (fallback to `proposed_rate`).
   - Prevents showing incorrect compensation for fixed-price bounties.

4. **Proof attachment confidentiality hardening**
   - Dashboard upload flow no longer stores `getPublicUrl()` links.
   - New submissions store storage `path` (bucket object key), not public URL.
   - Added shared helper (`apps/web/src/lib/proof-attachments.ts`) to:
     - normalize attachment payloads for insert
     - validate booking-scoped attachment paths (`${bookingId}/...`)
     - resolve signed URLs for authorized responses
   - Booking detail and proofs APIs now return signed URLs when possible.

## Why this matters

- Prevents Next.js 16 route prop regressions from silently breaking dashboard pages.
- Reduces risk of exposing proof files via long-lived public storage URLs.
