-- Talent connector workers: cached worker profiles from raised-hand talent networks.
-- Extends shared external_provider enum with talent network providers.

-- ============================================
-- EXTEND EXTERNAL PROVIDER ENUM (guarded)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'external_provider' AND e.enumlabel = 'upwork'
  ) THEN
    ALTER TYPE external_provider ADD VALUE 'upwork';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'external_provider' AND e.enumlabel = 'thumbtack'
  ) THEN
    ALTER TYPE external_provider ADD VALUE 'thumbtack';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'external_provider' AND e.enumlabel = 'taskrabbit'
  ) THEN
    ALTER TYPE external_provider ADD VALUE 'taskrabbit';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'external_provider' AND e.enumlabel = 'fiverr'
  ) THEN
    ALTER TYPE external_provider ADD VALUE 'fiverr';
  END IF;
END $$;

-- ============================================
-- TALENT CONNECTOR WORKERS (CACHED PROFILES)
-- ============================================

CREATE TABLE IF NOT EXISTS talent_connector_workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider external_provider NOT NULL,
  env external_provider_env NOT NULL,
  provider_worker_id TEXT NOT NULL,
  display_name TEXT,
  profile_url TEXT,
  skills_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  rate_json JSONB,
  availability_json JSONB,
  location TEXT,
  rating NUMERIC(3, 2),
  reviews_count INTEGER NOT NULL DEFAULT 0,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, provider, env, provider_worker_id)
);

CREATE INDEX IF NOT EXISTS idx_talent_connector_workers_agent_provider_env
  ON talent_connector_workers (agent_id, provider, env);

CREATE INDEX IF NOT EXISTS idx_talent_connector_workers_agent_synced
  ON talent_connector_workers (agent_id, last_synced_at DESC);

CREATE TRIGGER update_talent_connector_workers_updated_at
  BEFORE UPDATE ON talent_connector_workers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE talent_connector_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Talent connector workers are readable by owner"
  ON talent_connector_workers
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Talent connector workers are insertable by owner"
  ON talent_connector_workers
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Talent connector workers are updateable by owner"
  ON talent_connector_workers
  FOR UPDATE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()))
  WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Talent connector workers are deletable by owner"
  ON talent_connector_workers
  FOR DELETE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));
