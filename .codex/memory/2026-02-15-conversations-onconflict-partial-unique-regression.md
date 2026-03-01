# Conversations onConflict vs Partial Unique Index (2026-02-15)

## Symptom
- Starting a conversation from Contact Human failed with:
  - `there is no unique or exclusion constraint matching the ON CONFLICT specification`

## Root Cause
- Migration `043_conversations_per_booking.sql` removed table-level `UNIQUE(agent_id, human_id)` and replaced it with:
  - Partial unique index for direct conversations (`agent_id, human_id` where `booking_id IS NULL AND bounty_id IS NULL`)
  - Partial unique index for booking conversations (`booking_id` where `booking_id IS NOT NULL`)
- API code still used:
  - `.upsert(..., { onConflict: 'agent_id,human_id' })`
  - `.upsert(..., { onConflict: 'booking_id' })`
- PostgreSQL could not infer a non-partial unique/exclusion constraint from those `ON CONFLICT` clauses.

## Fix Shipped
- Added shared helper:
  - `apps/web/src/lib/conversation-links.ts`
  - `ensureConversationLink(...)` uses explicit select + insert/update + unique-violation retry.
- Replaced fragile upserts in:
  - `apps/web/src/app/api/v1/conversations/route.ts`
  - `apps/web/src/app/api/v1/bookings/route.ts`
  - `apps/web/src/lib/bounties/application-actions.ts`

## Operational Guidance
- Do not use `onConflict: 'agent_id,human_id'` for conversations in this schema shape.
- For partial-unique designs, prefer explicit get-or-create logic with retry on `23505`.
