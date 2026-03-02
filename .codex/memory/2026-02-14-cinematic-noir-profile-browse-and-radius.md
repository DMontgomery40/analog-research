# Cinematic noir profile + browse refresh + drive radius field

## What changed
- Public profile (`/humans/[id]`) and browse cards were restyled with a cinematic noir layout, gradient borders, and premium CTA styling.
- Added `humans.drive_radius_miles` (optional) to store how far a human is willing to drive for in-person work.
- Exposed drive radius in public profile + browse cards, added an editable field in the dashboard profile form, and added a `drive_radius_miles` browse filter (API + UI + MCP) that filters for humans willing to travel at least the requested miles.

## Why
- Visual parity and differentiation vs Rent a Human.
- Clearer signal about in-person availability and a simple way for Moltys/hirers to set minimum travel requirements (without hardcoding an upper bound).

## Key files
- UI: `/Users/davidmontgomery/analogresearch/apps/web/src/app/humans/[id]/page.tsx`
- UI: `/Users/davidmontgomery/analogresearch/apps/web/src/app/browse/browse-humans-client.tsx`
- UI: `/Users/davidmontgomery/analogresearch/apps/web/src/components/contact-human.tsx`
- Profile edit: `/Users/davidmontgomery/analogresearch/apps/web/src/app/(dashboard)/dashboard/profile/page.tsx`
- API: `/Users/davidmontgomery/analogresearch/apps/web/src/app/api/v1/humans/route.ts`
- API: `/Users/davidmontgomery/analogresearch/apps/web/src/app/api/v1/humans/[id]/route.ts`
- Admin: `/Users/davidmontgomery/analogresearch/apps/web/src/app/api/v1/admin/humans/[id]/route.ts`
- MCP: `/Users/davidmontgomery/analogresearch/packages/analogresearch-mcp/src/tools.ts`
- MCP dispatcher: `/Users/davidmontgomery/analogresearch/apps/web/src/lib/mcp/dispatcher.ts`
- Docs: `/Users/davidmontgomery/analogresearch/apps/web/src/app/mcp/page.tsx`
- Docs: `/Users/davidmontgomery/analogresearch/apps/web/src/app/api-docs/page.tsx`
- Docs: `/Users/davidmontgomery/analogresearch/apps/web/src/app/api/v1/llms.txt/route.ts`
- OpenAPI: `/Users/davidmontgomery/analogresearch/apps/web/public/openapi.json`
- Migration: `/Users/davidmontgomery/analogresearch/packages/database/supabase/migrations/041_human_drive_radius.sql`

## Revert plan (if we don’t like it)
1. Revert UI/UX changes in the files above.
2. Drop the `drive_radius_miles` column (or keep it unused) and remove references in API + UI + MCP + docs.
3. Regenerate DB types after any schema change (`pnpm db:generate`).
