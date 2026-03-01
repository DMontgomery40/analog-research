-- Prevent duplicate bookings for the same application (replay safety)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY application_id
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM bookings
  WHERE application_id IS NOT NULL
)
UPDATE bookings
SET application_id = NULL
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE row_num > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_application_id_unique
  ON bookings(application_id)
  WHERE application_id IS NOT NULL;
