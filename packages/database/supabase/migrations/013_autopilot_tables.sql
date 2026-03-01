-- Autopilot tables + audit log

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'autopilot_run_status') THEN
    CREATE TYPE autopilot_run_status AS ENUM ('planned', 'running', 'completed', 'failed', 'skipped');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_autopilot_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL,
  policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_autopilot_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES agent_autopilot_configs(id) ON DELETE CASCADE,
  status autopilot_run_status NOT NULL DEFAULT 'planned',
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_autopilot_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  active_config_id UUID REFERENCES agent_autopilot_configs(id) ON DELETE SET NULL,
  last_run_id UUID REFERENCES agent_autopilot_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id)
);

CREATE TABLE IF NOT EXISTS agent_autopilot_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id UUID REFERENCES agent_autopilot_runs(id) ON DELETE SET NULL,
  config_id UUID REFERENCES agent_autopilot_configs(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  action_status TEXT NOT NULL DEFAULT 'planned',
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  moderation_event_id UUID REFERENCES moderation_events(id) ON DELETE SET NULL,
  result_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_autopilot_configs_agent_created
  ON agent_autopilot_configs (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_autopilot_configs_enabled
  ON agent_autopilot_configs (agent_id)
  WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_agent_autopilot_runs_agent_created
  ON agent_autopilot_runs (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_autopilot_runs_status
  ON agent_autopilot_runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_autopilot_state_config
  ON agent_autopilot_state (active_config_id);

CREATE INDEX IF NOT EXISTS idx_agent_autopilot_audit_agent_created
  ON agent_autopilot_audit_log (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_autopilot_audit_run
  ON agent_autopilot_audit_log (run_id);

CREATE INDEX IF NOT EXISTS idx_agent_autopilot_audit_config
  ON agent_autopilot_audit_log (config_id);

CREATE INDEX IF NOT EXISTS idx_agent_autopilot_audit_moderation
  ON agent_autopilot_audit_log (moderation_event_id);

CREATE OR REPLACE FUNCTION prevent_agent_autopilot_config_policy_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.policy IS DISTINCT FROM OLD.policy OR NEW.schema_version IS DISTINCT FROM OLD.schema_version THEN
    RAISE EXCEPTION 'Autopilot policies are immutable; insert a new config version instead.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_agent_autopilot_audit_mutations()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'agent_autopilot_audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agent_autopilot_configs_updated_at BEFORE UPDATE ON agent_autopilot_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_autopilot_runs_updated_at BEFORE UPDATE ON agent_autopilot_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_autopilot_state_updated_at BEFORE UPDATE ON agent_autopilot_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER prevent_agent_autopilot_config_policy_mutation BEFORE UPDATE ON agent_autopilot_configs
  FOR EACH ROW EXECUTE FUNCTION prevent_agent_autopilot_config_policy_update();

CREATE TRIGGER prevent_agent_autopilot_audit_updates BEFORE UPDATE OR DELETE ON agent_autopilot_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_agent_autopilot_audit_mutations();

CREATE OR REPLACE FUNCTION current_owner_agent_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
AS $$
  SELECT a.id
  FROM agents a
  JOIN humans h ON a.name = ('human_' || h.id::text)
  WHERE h.user_id = auth.uid();
$$;

ALTER TABLE agent_autopilot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_autopilot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_autopilot_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_autopilot_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autopilot configs are readable by owner" ON agent_autopilot_configs
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Autopilot configs are writable by owner" ON agent_autopilot_configs
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Autopilot configs are updateable by owner" ON agent_autopilot_configs
  FOR UPDATE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()))
  WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Autopilot runs are readable by owner" ON agent_autopilot_runs
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Autopilot runs are writable by owner" ON agent_autopilot_runs
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Autopilot runs are updateable by owner" ON agent_autopilot_runs
  FOR UPDATE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()))
  WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Autopilot state is readable by owner" ON agent_autopilot_state
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Autopilot state is writable by owner" ON agent_autopilot_state
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Autopilot state is updateable by owner" ON agent_autopilot_state
  FOR UPDATE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()))
  WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Autopilot audit log is readable by owner" ON agent_autopilot_audit_log
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Autopilot audit log is insertable by owner" ON agent_autopilot_audit_log
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));
