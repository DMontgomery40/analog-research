-- MCP OAuth identity linking for ChatGPT app authentication.
-- Maps verified OAuth subjects to owner-operated ResearchAgent identities.

CREATE TABLE IF NOT EXISTS mcp_oauth_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  owner_human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  scopes_granted TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(trim(provider)) > 0),
  CHECK (length(trim(issuer)) > 0),
  CHECK (length(trim(subject)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_oauth_identities_provider_issuer_subject
  ON mcp_oauth_identities (provider, issuer, subject);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_identities_agent_provider
  ON mcp_oauth_identities (agent_id, provider);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_identities_owner_human
  ON mcp_oauth_identities (owner_human_id)
  WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS update_mcp_oauth_identities_updated_at ON mcp_oauth_identities;
CREATE TRIGGER update_mcp_oauth_identities_updated_at
  BEFORE UPDATE ON mcp_oauth_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


CREATE TABLE IF NOT EXISTS mcp_oauth_link_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'auth0',
  owner_human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  scopes_requested TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state)
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_link_states_agent_provider
  ON mcp_oauth_link_states (agent_id, provider);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_link_states_owner_human
  ON mcp_oauth_link_states (owner_human_id);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_link_states_expires_at
  ON mcp_oauth_link_states (expires_at);

DROP TRIGGER IF EXISTS update_mcp_oauth_link_states_updated_at ON mcp_oauth_link_states;
CREATE TRIGGER update_mcp_oauth_link_states_updated_at
  BEFORE UPDATE ON mcp_oauth_link_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


ALTER TABLE mcp_oauth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_link_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MCP OAuth identities are readable by owner" ON mcp_oauth_identities;
CREATE POLICY "MCP OAuth identities are readable by owner"
  ON mcp_oauth_identities
  FOR SELECT USING (
    owner_human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    OR agent_id IN (SELECT * FROM current_owner_agent_ids())
  );

DROP POLICY IF EXISTS "MCP OAuth identities are insertable by owner" ON mcp_oauth_identities;
CREATE POLICY "MCP OAuth identities are insertable by owner"
  ON mcp_oauth_identities
  FOR INSERT WITH CHECK (
    owner_human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    OR agent_id IN (SELECT * FROM current_owner_agent_ids())
  );

DROP POLICY IF EXISTS "MCP OAuth identities are updateable by owner" ON mcp_oauth_identities;
CREATE POLICY "MCP OAuth identities are updateable by owner"
  ON mcp_oauth_identities
  FOR UPDATE USING (
    owner_human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    OR agent_id IN (SELECT * FROM current_owner_agent_ids())
  )
  WITH CHECK (
    owner_human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    OR agent_id IN (SELECT * FROM current_owner_agent_ids())
  );

DROP POLICY IF EXISTS "MCP OAuth identities are deletable by owner" ON mcp_oauth_identities;
CREATE POLICY "MCP OAuth identities are deletable by owner"
  ON mcp_oauth_identities
  FOR DELETE USING (
    owner_human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    OR agent_id IN (SELECT * FROM current_owner_agent_ids())
  );


DROP POLICY IF EXISTS "MCP OAuth link states are readable by owner" ON mcp_oauth_link_states;
CREATE POLICY "MCP OAuth link states are readable by owner"
  ON mcp_oauth_link_states
  FOR SELECT USING (
    owner_human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    OR agent_id IN (SELECT * FROM current_owner_agent_ids())
  );

DROP POLICY IF EXISTS "MCP OAuth link states are insertable by owner" ON mcp_oauth_link_states;
CREATE POLICY "MCP OAuth link states are insertable by owner"
  ON mcp_oauth_link_states
  FOR INSERT WITH CHECK (
    owner_human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    OR agent_id IN (SELECT * FROM current_owner_agent_ids())
  );

DROP POLICY IF EXISTS "MCP OAuth link states are updateable by owner" ON mcp_oauth_link_states;
CREATE POLICY "MCP OAuth link states are updateable by owner"
  ON mcp_oauth_link_states
  FOR UPDATE USING (
    owner_human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    OR agent_id IN (SELECT * FROM current_owner_agent_ids())
  )
  WITH CHECK (
    owner_human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    OR agent_id IN (SELECT * FROM current_owner_agent_ids())
  );

DROP POLICY IF EXISTS "MCP OAuth link states are deletable by owner" ON mcp_oauth_link_states;
CREATE POLICY "MCP OAuth link states are deletable by owner"
  ON mcp_oauth_link_states
  FOR DELETE USING (
    owner_human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    OR agent_id IN (SELECT * FROM current_owner_agent_ids())
  );
