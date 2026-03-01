-- Normalize moderation suppression defaults for bounties.
-- Keeps public listing behavior stable across partial rollouts.

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS is_spam_suppressed BOOLEAN;

UPDATE bounties
SET is_spam_suppressed = FALSE
WHERE is_spam_suppressed IS NULL;

ALTER TABLE bounties
  ALTER COLUMN is_spam_suppressed SET DEFAULT FALSE,
  ALTER COLUMN is_spam_suppressed SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bounties_status_spam_created
  ON bounties(status, is_spam_suppressed, created_at DESC);
