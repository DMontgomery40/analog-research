-- Moderation and anti-spam pipeline

-- ============================================
-- ENUMS
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'moderation_decision') THEN
    CREATE TYPE moderation_decision AS ENUM ('allow', 'warn', 'fail', 'unscanned');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'moderation_surface') THEN
    CREATE TYPE moderation_surface AS ENUM ('bounty', 'application', 'message', 'conversation_initial');
  END IF;
END $$;

-- ============================================
-- TABLE EXTENSIONS
-- ============================================

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS moderation_decision moderation_decision DEFAULT 'allow',
  ADD COLUMN IF NOT EXISTS moderation_reason_codes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS moderation_risk_score DECIMAL(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_confidence DECIMAL(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_policy_version TEXT DEFAULT '2026-02-08-v1',
  ADD COLUMN IF NOT EXISTS moderation_updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_spam_suppressed BOOLEAN DEFAULT FALSE;

ALTER TABLE bounties
  ALTER COLUMN moderation_decision SET NOT NULL,
  ALTER COLUMN moderation_reason_codes SET NOT NULL,
  ALTER COLUMN moderation_risk_score SET NOT NULL,
  ALTER COLUMN moderation_confidence SET NOT NULL,
  ALTER COLUMN moderation_policy_version SET NOT NULL,
  ALTER COLUMN moderation_updated_at SET NOT NULL,
  ALTER COLUMN is_spam_suppressed SET NOT NULL;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS moderation_decision moderation_decision DEFAULT 'allow',
  ADD COLUMN IF NOT EXISTS moderation_reason_codes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS moderation_risk_score DECIMAL(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_confidence DECIMAL(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_policy_version TEXT DEFAULT '2026-02-08-v1',
  ADD COLUMN IF NOT EXISTS moderation_updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE applications
  ALTER COLUMN moderation_decision SET NOT NULL,
  ALTER COLUMN moderation_reason_codes SET NOT NULL,
  ALTER COLUMN moderation_risk_score SET NOT NULL,
  ALTER COLUMN moderation_confidence SET NOT NULL,
  ALTER COLUMN moderation_policy_version SET NOT NULL,
  ALTER COLUMN moderation_updated_at SET NOT NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS moderation_decision moderation_decision DEFAULT 'allow',
  ADD COLUMN IF NOT EXISTS moderation_reason_codes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS moderation_risk_score DECIMAL(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_confidence DECIMAL(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_policy_version TEXT DEFAULT '2026-02-08-v1',
  ADD COLUMN IF NOT EXISTS moderation_updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE messages
  ALTER COLUMN moderation_decision SET NOT NULL,
  ALTER COLUMN moderation_reason_codes SET NOT NULL,
  ALTER COLUMN moderation_risk_score SET NOT NULL,
  ALTER COLUMN moderation_confidence SET NOT NULL,
  ALTER COLUMN moderation_policy_version SET NOT NULL,
  ALTER COLUMN moderation_updated_at SET NOT NULL;

-- ============================================
-- MODERATION TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS moderation_runtime_config (
  id SMALLINT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'openrouter',
  model_primary TEXT NOT NULL DEFAULT 'mistralai/mistral-nemo',
  model_escalation TEXT NOT NULL DEFAULT 'meta-llama/llama-guard-3-8b',
  timeout_ms INTEGER NOT NULL DEFAULT 1800,
  fail_confidence DECIMAL(4,3) NOT NULL DEFAULT 0.93,
  warn_confidence DECIMAL(4,3) NOT NULL DEFAULT 0.60,
  max_input_chars INTEGER NOT NULL DEFAULT 12000,
  daily_token_budget BIGINT NOT NULL DEFAULT 1000000,
  policy_version TEXT NOT NULL DEFAULT '2026-02-08-v1',
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT moderation_runtime_config_id_ck CHECK (id = 1)
);

INSERT INTO moderation_runtime_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS moderation_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  surface moderation_surface NOT NULL,
  content_type TEXT NOT NULL,
  content_id UUID,
  actor_type message_sender_type NOT NULL,
  actor_id UUID NOT NULL,
  decision moderation_decision NOT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  risk_score DECIMAL(4,3) NOT NULL DEFAULT 0,
  confidence DECIMAL(4,3) NOT NULL DEFAULT 0,
  spam_action TEXT NOT NULL DEFAULT 'none',
  policy_version TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  raw_content_hash TEXT,
  evidence JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_events_created_at ON moderation_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_events_actor ON moderation_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_events_surface ON moderation_events(surface, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_events_decision ON moderation_events(decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_events_content ON moderation_events(content_type, content_id);

CREATE TABLE IF NOT EXISTS link_risk_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_url TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  verdict moderation_decision NOT NULL DEFAULT 'allow',
  confidence DECIMAL(4,3) NOT NULL DEFAULT 0,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  provider TEXT NOT NULL DEFAULT 'heuristic',
  metadata JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_risk_cache_domain ON link_risk_cache(domain);
CREATE INDEX IF NOT EXISTS idx_link_risk_cache_expires ON link_risk_cache(expires_at);

CREATE TABLE IF NOT EXISTS spam_fingerprints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  surface moderation_surface NOT NULL,
  actor_type message_sender_type NOT NULL,
  actor_id UUID NOT NULL,
  content_hash TEXT NOT NULL,
  simhash TEXT NOT NULL,
  primary_domain TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spam_fingerprints_hash ON spam_fingerprints(content_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spam_fingerprints_actor ON spam_fingerprints(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spam_fingerprints_surface ON spam_fingerprints(surface, created_at DESC);

CREATE TABLE IF NOT EXISTS spam_clusters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_key TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  surface moderation_surface NOT NULL,
  dominant_reason TEXT,
  volume INTEGER NOT NULL DEFAULT 1,
  actor_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spam_clusters_last_seen ON spam_clusters(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS moderation_rescan_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  surface moderation_surface NOT NULL,
  content_type TEXT NOT NULL,
  content_id UUID,
  actor_type message_sender_type NOT NULL,
  actor_id UUID NOT NULL,
  content_text TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_rescan_queue_pending ON moderation_rescan_queue(status, next_run_at);

-- updated_at trigger coverage
CREATE TRIGGER update_moderation_runtime_config_updated_at BEFORE UPDATE ON moderation_runtime_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_link_risk_cache_updated_at BEFORE UPDATE ON link_risk_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spam_clusters_updated_at BEFORE UPDATE ON spam_clusters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_moderation_rescan_queue_updated_at BEFORE UPDATE ON moderation_rescan_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS HARDENING
-- ============================================

DROP POLICY IF EXISTS "Humans can send messages" ON messages;
DROP POLICY IF EXISTS "Humans can create applications" ON applications;

-- Service role only for moderation tables
ALTER TABLE moderation_runtime_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_risk_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE spam_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE spam_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_rescan_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Moderation runtime config is not publicly accessible" ON moderation_runtime_config
  FOR ALL USING (false);

CREATE POLICY "Moderation events are not publicly accessible" ON moderation_events
  FOR ALL USING (false);

CREATE POLICY "Link risk cache is not publicly accessible" ON link_risk_cache
  FOR ALL USING (false);

CREATE POLICY "Spam fingerprints are not publicly accessible" ON spam_fingerprints
  FOR ALL USING (false);

CREATE POLICY "Spam clusters are not publicly accessible" ON spam_clusters
  FOR ALL USING (false);

CREATE POLICY "Moderation rescan queue is not publicly accessible" ON moderation_rescan_queue
  FOR ALL USING (false);
