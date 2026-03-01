-- Add UNIQUE constraint on humans.user_id
-- This prevents multiple human profiles per user account

-- First, remove any remaining duplicates (keep most recent)
DELETE FROM humans h1
WHERE h1.id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM humans
  ORDER BY user_id, created_at DESC
);

-- Now add the unique constraint
ALTER TABLE humans ADD CONSTRAINT humans_user_id_unique UNIQUE (user_id);

-- Drop the redundant index (unique constraint creates its own)
DROP INDEX IF EXISTS idx_humans_user_id;
