-- Fix bounties capacity pagination and harden booking creation idempotency.
--
-- 1) Add a generated `spots_remaining` column to bounties so API filters can be applied
--    in SQL (and count/pagination stays correct).
-- 2) Enforce at-most-one booking per application_id to prevent concurrency races when
--    accepting applications.

-- ============================================
-- BOUNTIES: GENERATED SPOTS_REMAINING
-- ============================================

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS spots_remaining INTEGER
  GENERATED ALWAYS AS (GREATEST(spots_available - spots_filled, 0)) STORED;

CREATE INDEX IF NOT EXISTS idx_bounties_spots_remaining
  ON bounties(spots_remaining);

-- ============================================
-- BOOKINGS: UNIQUENESS FOR APPLICATION-BASED BOOKINGS
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_application_id
  ON bookings(application_id)
  WHERE application_id IS NOT NULL;

