-- Critical/high audit fixes:
-- - Make auto-complete use an explicit submission timestamp.
-- - Fix mark_escrow_funded_atomic transaction idempotency conflict target.
-- - Ensure only one running autopilot run per config.
-- - Restrict direct humans table reads to profile owners (public reads go through controlled APIs).

-- Track when a booking enters submitted state so auto-complete timing is based on
-- submission time rather than any unrelated row update.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

UPDATE bookings
SET submitted_at = COALESCE(submitted_at, updated_at, created_at)
WHERE status = 'submitted'
  AND submitted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_submitted_funded_submitted_at
  ON bookings(submitted_at)
  WHERE status = 'submitted' AND escrow_status = 'funded';

-- mark_escrow_funded_atomic replacement is applied separately in 046.

WITH ranked_running AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY config_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM agent_autopilot_runs
  WHERE status = 'running'
)
UPDATE agent_autopilot_runs AS runs
SET
  status = 'failed',
  result = COALESCE(runs.result, '{}'::jsonb) || jsonb_build_object(
    'error', 'Superseded by migration 042 duplicate-running cleanup',
    'retryable', false
  )
WHERE runs.id IN (
  SELECT id
  FROM ranked_running
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_autopilot_runs_single_running_per_config
  ON agent_autopilot_runs(config_id)
  WHERE status = 'running';

DROP POLICY IF EXISTS "Humans are publicly readable" ON humans;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'humans'
      AND policyname = 'Users can read own human profile'
  ) THEN
    CREATE POLICY "Users can read own human profile" ON humans
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END
$$;
