-- Owner identity, payment preferences, and bounty proof review mode.
-- This migration moves owner-agent resolution to FK-first while preserving
-- legacy human_<uuid> fallback during transition.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS owner_human_id UUID REFERENCES humans(id) ON DELETE SET NULL;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS default_payment_method payment_method;

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS preferred_payment_method payment_method;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proof_review_mode') THEN
    CREATE TYPE proof_review_mode AS ENUM ('manual', 'llm_assisted');
  END IF;
END $$;

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS proof_review_mode proof_review_mode NOT NULL DEFAULT 'manual';

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS proof_review_prompt TEXT;

-- Backfill owner_human_id from legacy owner agent naming convention.
UPDATE agents AS a
SET owner_human_id = h.id
FROM humans AS h
WHERE a.owner_human_id IS NULL
  AND a.name = ('human_' || h.id::text);

CREATE INDEX IF NOT EXISTS idx_agents_owner_human_id ON agents(owner_human_id);
CREATE INDEX IF NOT EXISTS idx_agents_default_payment_method ON agents(default_payment_method);
CREATE INDEX IF NOT EXISTS idx_bounties_preferred_payment_method ON bounties(preferred_payment_method);
CREATE INDEX IF NOT EXISTS idx_bounties_proof_review_mode ON bounties(proof_review_mode);

CREATE OR REPLACE FUNCTION current_owner_agent_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT a.id
  FROM humans h
  JOIN agents a ON (
    a.owner_human_id = h.id
    OR (
      a.owner_human_id IS NULL
      AND a.name = ('human_' || h.id::text)
    )
  )
  WHERE h.user_id = auth.uid();
$$;
