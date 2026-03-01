# Proof Attachments Bucket Missing in Production (2026-02-15)

## Symptom
- Humans could not upload proof photos/files from booking proof submit UI.
- Supabase storage reported zero buckets in production.

## Root Cause
- Bucket `proof-attachments` (used by both proof and message attachment uploads) was never provisioned in DB/storage setup.

## Fix
- Added migration:
  - `packages/database/supabase/migrations/048_proof_attachments_storage_bucket.sql`
- Migration creates:
  - Private bucket `proof-attachments`
  - `storage.objects` policies for authenticated upload + own-object read/delete
- Applied migration directly to production DB via `psql` using `.env` project credentials.

## Verification
- `supabase.storage.listBuckets()` now returns `proof-attachments`.
- `pg_policies` contains:
  - `Proof attachments upload (authenticated)`
  - `Proof attachments read own objects`
  - `Proof attachments delete own objects`
