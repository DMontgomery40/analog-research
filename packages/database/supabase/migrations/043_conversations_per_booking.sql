-- Conversations: allow multiple threads per agent/human by booking.
--
-- Previous schema enforced UNIQUE(agent_id, human_id), which caused later booking/bounty
-- links to overwrite earlier ones when callers used upserts. We keep direct (no booking/bounty)
-- conversations unique per agent/human, and make booking-linked conversations unique per booking.

DO $$
BEGIN
  -- Default constraint name from Postgres for UNIQUE(agent_id, human_id).
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_agent_id_human_id_key'
  ) THEN
    ALTER TABLE conversations
      DROP CONSTRAINT conversations_agent_id_human_id_key;
  END IF;
END $$;

-- One "direct" conversation per agent/human when not linked to a booking or bounty.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_direct_unique
  ON conversations(agent_id, human_id)
  WHERE booking_id IS NULL AND bounty_id IS NULL;

-- One conversation per booking when booking_id is set.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_one_per_booking
  ON conversations(booking_id)
  WHERE booking_id IS NOT NULL;

