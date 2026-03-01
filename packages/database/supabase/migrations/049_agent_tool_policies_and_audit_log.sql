-- Tool guardrails: per-agent tool policies + append-only audit log for policy decisions.

CREATE TABLE IF NOT EXISTS agent_tool_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL,
  policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_policies_agent
  ON agent_tool_policies (agent_id);

CREATE TRIGGER update_agent_tool_policies_updated_at
  BEFORE UPDATE ON agent_tool_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS agent_tool_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason_code TEXT,
  reason TEXT,
  amount_cents INTEGER,
  provider external_provider,
  source TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_audit_agent_created
  ON agent_tool_audit_log (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_tool_audit_tool_created
  ON agent_tool_audit_log (tool_name, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_agent_tool_audit_mutations()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'agent_tool_audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_agent_tool_audit_updates BEFORE UPDATE OR DELETE ON agent_tool_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_agent_tool_audit_mutations();

ALTER TABLE agent_tool_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent tool policies are readable by owner" ON agent_tool_policies
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Agent tool policies are insertable by owner" ON agent_tool_policies
  FOR INSERT WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Agent tool policies are updateable by owner" ON agent_tool_policies
  FOR UPDATE USING (agent_id IN (SELECT * FROM current_owner_agent_ids()))
  WITH CHECK (agent_id IN (SELECT * FROM current_owner_agent_ids()));

CREATE POLICY "Agent tool audit log is readable by owner" ON agent_tool_audit_log
  FOR SELECT USING (agent_id IN (SELECT * FROM current_owner_agent_ids()));

