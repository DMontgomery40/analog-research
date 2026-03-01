-- Add optional drive radius for in-person work.

ALTER TABLE humans
  ADD COLUMN IF NOT EXISTS drive_radius_miles INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'humans_drive_radius_nonnegative'
  ) THEN
    ALTER TABLE humans
      ADD CONSTRAINT humans_drive_radius_nonnegative
      CHECK (drive_radius_miles IS NULL OR drive_radius_miles >= 0);
  END IF;
END $$;

COMMENT ON COLUMN humans.drive_radius_miles IS 'Max radius in miles the human is willing to drive for in-person work.';
