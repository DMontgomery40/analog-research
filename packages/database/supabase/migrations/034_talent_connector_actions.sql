-- Talent connector actions: idempotent audit log for connector operations.

-- ============================================
-- ENUMS
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'talent_connector_action_type') THEN
    CREATE TYPE talent_connector_action_type AS ENUM (
      'contact',
      'post_task',
      'sync'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'talent_connector_action_status') THEN
    CREATE TYPE talent_connector_action_status AS ENUM (
      'pending',
      'success',
      'failed'
    );
  END IF;
END $$;

-- ============================================
-- TALENT CONNECTOR ACTIONS (IDEMPOTENT AUDIT LOG)
-- ============================================

CREATE TABLE IF NOT EXISTS talent_connector_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider external_provider NOT NULL,
  env external_provider_env NOT NULL,
  action_type talent_connector_action_type NOT NULL,
  idempotency_key TEXT NOT NULL,
  match_id UUID REFERENCES talent_connector_matches(id) ON DELETE SET NULL,
  worker_id UUID REFERENCES talent_connector_workers(id) ON DELETE SET NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status talent_connector_action_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, provider, env, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_talent_connector_actions_agent_provider
  ON talent_connector_actions (agent_id, provider, env, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_talent_connector_actions_match
  ON talent_connector_actions (match_id, created_at DESC)
  WHERE match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talent_connector_actions_worker
  ON talent_connector_actions (worker_id, created_at DESC)
  WHERE worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talent_connector_actions_idempotency
  ON talent_connector_actions (agent_id, provider, env, idempotency_key);

CREATE TRIGGER update_talent_connector_actions_updated_at
  BEFORE UPDATE ON talent_connector_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE talent_connector_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Talent connector actions are readable by owner"
  ON talent_connector_actions
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Talent connector actions are insertable by owner"
  ON talent_connector_actions
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Talent connector actions are updateable by owner"
  ON talent_connector_actions
  FOR UPDATE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()))
  WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));
