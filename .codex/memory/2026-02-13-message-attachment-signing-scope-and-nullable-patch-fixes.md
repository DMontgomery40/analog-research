# Message attachment signing scope + nullable bounty PATCH semantics (2026-02-13)

## What happened

Code review surfaced four regressions:

1. Message attachments accepted arbitrary storage-looking `url` values and then re-signed extracted paths with service-role storage access.
2. `PATCH /api/v1/bounties/[id]` used `??` for `preferred_payment_method`, so explicit `null` could not clear the field.
3. Same `??` bug for `proof_review_prompt`, so explicit `null` could not clear prompt in `llm_assisted` mode.
4. Realtime message inserts appended raw DB rows (attachments with `path` only), so new attachment messages lacked signed URLs until refresh.

## Fix pattern

- In `apps/web/src/lib/message-attachments.ts`:
  - Validate URL-derived bucket paths against conversation scope.
  - Reject cross-conversation storage URLs.
  - Normalize same-conversation storage URLs to canonical `path`.
  - Only sign paths that pass scope checks when `conversationId` is provided.

- In `apps/web/src/app/api/v1/bounties/[id]/route.ts`:
  - Use property-presence checks (`'field' in updates`) instead of nullish coalescing for nullable fields.
  - This preserves explicit `null` writes for clearing values.

- In realtime chat clients (`use-realtime-messages` and Molty inbox page):
  - Upsert raw incoming message immediately.
  - Best-effort hydrate message via `/api/v1/conversations/{id}/messages` to swap in signed attachment URLs.

## Tests added

- `tests/web/api/conversations/messages.unit.test.ts`
  - New test: reject attachment URL that points to another conversation path.
- `tests/web/api/bounties/route.patch.unit.test.ts`
  - New tests: explicit `null` persists for `preferred_payment_method` and `proof_review_prompt`.

## Verification

- Targeted tests for conversations/bounties/booking funding pass.
- Full `pnpm verify` passes (lint/typecheck/tests/build and quality gates).
