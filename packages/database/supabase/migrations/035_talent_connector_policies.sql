-- Talent connector policies: per-agent per-provider action gates.
-- Also adds cross-agent ownership trigger for talent_connector_matches links.

-- ============================================
-- TALENT CONNECTOR POLICIES
-- ============================================

CREATE TABLE IF NOT EXISTS talent_connector_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider external_provider NOT NULL,
  allow_discovery BOOLEAN NOT NULL DEFAULT TRUE,
  allow_contact BOOLEAN NOT NULL DEFAULT FALSE,
  allow_post_task BOOLEAN NOT NULL DEFAULT FALSE,
  allow_payment BOOLEAN NOT NULL DEFAULT FALSE,
  max_cache_hours INTEGER DEFAULT 24,
  max_spend_cents_per_action INTEGER,
  require_approval_above_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_talent_connector_policies_agent
  ON talent_connector_policies (agent_id);

CREATE TRIGGER update_talent_connector_policies_updated_at
  BEFORE UPDATE ON talent_connector_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MATCH LINK VALIDATION TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION validate_talent_connector_match_links()
RETURNS TRIGGER AS $$
DECLARE
  linked_agent_id UUID;
  linked_provider external_provider;
  linked_env external_provider_env;
BEGIN
  -- Worker must belong to same agent
  IF NEW.worker_id IS NOT NULL THEN
    SELECT w.agent_id, w.provider, w.env
    INTO linked_agent_id, linked_provider, linked_env
    FROM talent_connector_workers w
    WHERE w.id = NEW.worker_id;

    IF linked_agent_id IS NULL THEN
      RAISE EXCEPTION 'talent_connector_matches.worker_id references a missing worker';
    END IF;

    IF linked_agent_id <> NEW.agent_id THEN
      RAISE EXCEPTION 'talent_connector_matches.worker_id must belong to same agent_id';
    END IF;

    IF linked_provider <> NEW.provider THEN
      RAISE EXCEPTION 'talent_connector_matches.provider must match worker provider';
    END IF;

    IF linked_env <> NEW.env THEN
      RAISE EXCEPTION 'talent_connector_matches.env must match worker env';
    END IF;
  END IF;

  -- Bounty must belong to same agent
  IF NEW.bounty_id IS NOT NULL THEN
    SELECT b.agent_id
    INTO linked_agent_id
    FROM bounties b
    WHERE b.id = NEW.bounty_id;

    IF linked_agent_id IS NULL THEN
      RAISE EXCEPTION 'talent_connector_matches.bounty_id references a missing bounty';
    END IF;

    IF linked_agent_id <> NEW.agent_id THEN
      RAISE EXCEPTION 'talent_connector_matches.bounty_id must belong to same agent_id';
    END IF;
  END IF;

  -- Booking must belong to same agent
  IF NEW.booking_id IS NOT NULL THEN
    SELECT bk.agent_id
    INTO linked_agent_id
    FROM bookings bk
    WHERE bk.id = NEW.booking_id;

    IF linked_agent_id IS NULL THEN
      RAISE EXCEPTION 'talent_connector_matches.booking_id references a missing booking';
    END IF;

    IF linked_agent_id <> NEW.agent_id THEN
      RAISE EXCEPTION 'talent_connector_matches.booking_id must belong to same agent_id';
    END IF;
  END IF;

  -- Conversation must belong to same agent
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT c.agent_id
    INTO linked_agent_id
    FROM conversations c
    WHERE c.id = NEW.conversation_id;

    IF linked_agent_id IS NULL THEN
      RAISE EXCEPTION 'talent_connector_matches.conversation_id references a missing conversation';
    END IF;

    IF linked_agent_id <> NEW.agent_id THEN
      RAISE EXCEPTION 'talent_connector_matches.conversation_id must belong to same agent_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_talent_connector_match_links_before_write ON talent_connector_matches;

CREATE TRIGGER validate_talent_connector_match_links_before_write
  BEFORE INSERT OR UPDATE ON talent_connector_matches
  FOR EACH ROW
  EXECUTE FUNCTION validate_talent_connector_match_links();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE talent_connector_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Talent connector policies are readable by owner"
  ON talent_connector_policies
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Talent connector policies are insertable by owner"
  ON talent_connector_policies
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Talent connector policies are updateable by owner"
  ON talent_connector_policies
  FOR UPDATE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()))
  WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Talent connector policies are deletable by owner"
  ON talent_connector_policies
  FOR DELETE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));
