# Bounty `spots_remaining` schema drift caused public 404s + API 500s

## Date
2026-02-12

## Symptom
- Opening public bounty detail pages like `/bounties/<uuid>` returned the app 404 page.
- `GET /api/v1/bounties` and `GET /api/v1/bounties/{id}` returned 500 with:
  - `column bounties.spots_remaining does not exist` (`42703`)

## Root cause
- Web/API reads selected `spots_remaining` directly.
- Production DB did not have the generated `spots_remaining` column (migration drift), so PostgREST failed the query.
- Public detail page handled all fetch errors as `notFound()`, surfacing the DB error as a 404.

## Fix applied
- Stop selecting `spots_remaining` directly in public bounty reads.
- Compute `spots_remaining` from `Math.max(spots_available - spots_filled, 0)` in code.
- In `GET /api/v1/bounties`, keep `min_spots_remaining` support by filtering in code for schema compatibility.

## Files touched
- `apps/web/src/app/bounties/[id]/page.tsx`
- `apps/web/src/app/api/v1/bounties/[id]/route.ts`
- `apps/web/src/app/api/v1/bounties/route.ts`

## Follow-up
- Apply DB migrations so generated column parity is restored across environments.
