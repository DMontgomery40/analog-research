-- External jobs + provider integrations (v1: field checks via ProxyPics)

-- ============================================
-- ENUMS
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'external_provider') THEN
    CREATE TYPE external_provider AS ENUM ('proxypics', 'wegolook');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'external_provider_env') THEN
    CREATE TYPE external_provider_env AS ENUM ('live', 'sandbox');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'external_job_kind') THEN
    CREATE TYPE external_job_kind AS ENUM ('field_check');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'external_job_status') THEN
    CREATE TYPE external_job_status AS ENUM (
      'open',
      'in_progress',
      'action_required',
      'completed',
      'cancelled',
      'expired',
      'failed'
    );
  END IF;
END $$;

-- ============================================
-- NOTIFICATIONS (Agent + Human)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_type' AND e.enumlabel = 'external_job_created'
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'external_job_created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_type' AND e.enumlabel = 'external_job_updated'
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'external_job_updated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_type' AND e.enumlabel = 'external_job_completed'
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'external_job_completed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_type' AND e.enumlabel = 'external_job_failed'
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'external_job_failed';
  END IF;
END $$;

-- ============================================
-- EXTERNAL INTEGRATIONS (ENCRYPTED CREDENTIALS)
-- ============================================

CREATE TABLE IF NOT EXISTS external_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider external_provider NOT NULL,
  env external_provider_env NOT NULL,
  credentials_encrypted TEXT NOT NULL,
  credentials_mask TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, provider, env)
);

CREATE INDEX IF NOT EXISTS idx_external_integrations_agent_provider_env
  ON external_integrations (agent_id, provider, env);

CREATE TRIGGER update_external_integrations_updated_at BEFORE UPDATE ON external_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- EXTERNAL JOBS (CANONICAL RECORD)
-- ============================================

CREATE TABLE IF NOT EXISTS external_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  kind external_job_kind NOT NULL,
  provider external_provider NOT NULL,
  provider_env external_provider_env NOT NULL,
  status external_job_status NOT NULL DEFAULT 'open',
  title TEXT,
  instructions TEXT,
  address TEXT NOT NULL,
  public_only BOOLEAN NOT NULL DEFAULT TRUE,
  auto_approve BOOLEAN NOT NULL DEFAULT TRUE,
  scheduled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  provider_job_id TEXT,
  provider_reference TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_jobs_agent_created
  ON external_jobs (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_jobs_agent_status_updated
  ON external_jobs (agent_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_jobs_provider_lookup
  ON external_jobs (provider, provider_env, provider_job_id);

CREATE TRIGGER update_external_jobs_updated_at BEFORE UPDATE ON external_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- EXTERNAL JOB EVENTS (APPEND-ONLY TIMELINE)
-- ============================================

CREATE TABLE IF NOT EXISTS external_job_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES external_jobs(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider external_provider NOT NULL,
  provider_env external_provider_env NOT NULL,
  source TEXT NOT NULL,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_job_events_job_created
  ON external_job_events (job_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_external_job_events_agent_created
  ON external_job_events (agent_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_external_job_event_mutations()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'external_job_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_external_job_events_updates
  BEFORE UPDATE OR DELETE ON external_job_events
  FOR EACH ROW EXECUTE FUNCTION prevent_external_job_event_mutations();

-- ============================================
-- RLS POLICIES (DASHBOARD USER OPERATING OWNER MOLTYS)
-- ============================================

ALTER TABLE external_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_job_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "External integrations are readable by owner" ON external_integrations
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "External integrations are writable by owner" ON external_integrations
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "External integrations are updateable by owner" ON external_integrations
  FOR UPDATE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()))
  WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "External integrations are deletable by owner" ON external_integrations
  FOR DELETE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "External jobs are readable by owner" ON external_jobs
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "External jobs are writable by owner" ON external_jobs
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "External jobs are updateable by owner" ON external_jobs
  FOR UPDATE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()))
  WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "External job events are readable by owner" ON external_job_events
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "External job events are insertable by owner" ON external_job_events
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

