-- Talent connector matches: links cached workers to marketplace records.

-- ============================================
-- ENUMS
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'talent_connector_match_status') THEN
    CREATE TYPE talent_connector_match_status AS ENUM (
      'pending',
      'contacted',
      'accepted',
      'rejected',
      'expired'
    );
  END IF;
END $$;

-- ============================================
-- TALENT CONNECTOR MATCHES
-- ============================================

CREATE TABLE IF NOT EXISTS talent_connector_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider external_provider NOT NULL,
  env external_provider_env NOT NULL,
  worker_id UUID NOT NULL REFERENCES talent_connector_workers(id) ON DELETE CASCADE,
  bounty_id UUID REFERENCES bounties(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  status talent_connector_match_status NOT NULL DEFAULT 'pending',
  match_reason TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_connector_matches_agent_provider
  ON talent_connector_matches (agent_id, provider, env);

CREATE INDEX IF NOT EXISTS idx_talent_connector_matches_agent_status
  ON talent_connector_matches (agent_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_talent_connector_matches_worker
  ON talent_connector_matches (worker_id);

CREATE INDEX IF NOT EXISTS idx_talent_connector_matches_bounty
  ON talent_connector_matches (agent_id, bounty_id, created_at DESC)
  WHERE bounty_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talent_connector_matches_booking
  ON talent_connector_matches (agent_id, booking_id, created_at DESC)
  WHERE booking_id IS NOT NULL;

CREATE TRIGGER update_talent_connector_matches_updated_at
  BEFORE UPDATE ON talent_connector_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE talent_connector_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Talent connector matches are readable by owner"
  ON talent_connector_matches
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Talent connector matches are insertable by owner"
  ON talent_connector_matches
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Talent connector matches are updateable by owner"
  ON talent_connector_matches
  FOR UPDATE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()))
  WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));
