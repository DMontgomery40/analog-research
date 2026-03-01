-- Notification Channels for Delivery
-- Enables bidirectional notification delivery to both Humans and Moltys (Agents)
-- Channels: webhook, email, slack, discord

-- ============================================
-- ENUM
-- ============================================

CREATE TYPE notification_channel_type AS ENUM ('webhook', 'email', 'slack', 'discord');

-- ============================================
-- NOTIFICATION CHANNELS TABLE
-- ============================================

CREATE TABLE notification_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Entity can be 'human' or 'agent' (Molty)
  entity_type message_sender_type NOT NULL,
  entity_id UUID NOT NULL,

  -- Channel configuration
  channel_type notification_channel_type NOT NULL,
  channel_config JSONB NOT NULL DEFAULT '{}',
  -- channel_config schemas:
  -- webhook: { "url": "https://...", "secret": "optional_hmac_secret" }
  -- email: { "address": "user@example.com" } (or uses profile email if empty)
  -- slack: { "webhook_url": "https://hooks.slack.com/..." }
  -- discord: { "webhook_url": "https://discord.com/api/webhooks/..." }

  -- Enable/disable without deleting
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  name TEXT, -- Optional friendly name like "My Slack workspace"

  -- Tracking
  last_delivered_at TIMESTAMPTZ,
  delivery_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One channel type per entity (can have webhook AND email, but not two webhooks)
  UNIQUE (entity_type, entity_id, channel_type)
);

-- Indexes
CREATE INDEX idx_notification_channels_entity ON notification_channels(entity_type, entity_id);
CREATE INDEX idx_notification_channels_enabled ON notification_channels(entity_type, entity_id, enabled) WHERE enabled = true;

-- Updated at trigger
CREATE TRIGGER update_notification_channels_updated_at BEFORE UPDATE ON notification_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;

-- Humans can view their own channels
CREATE POLICY "Humans can view own channels" ON notification_channels
  FOR SELECT USING (
    entity_type = 'human' AND
    entity_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

-- Humans can insert their own channels
CREATE POLICY "Humans can insert own channels" ON notification_channels
  FOR INSERT WITH CHECK (
    entity_type = 'human' AND
    entity_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

-- Humans can update their own channels
CREATE POLICY "Humans can update own channels" ON notification_channels
  FOR UPDATE USING (
    entity_type = 'human' AND
    entity_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

-- Humans can delete their own channels
CREATE POLICY "Humans can delete own channels" ON notification_channels
  FOR DELETE USING (
    entity_type = 'human' AND
    entity_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

-- Agent channels are managed via service role (API key auth bypasses RLS)
-- No public policy needed for agents since API routes use service client

-- ============================================
-- NOTIFICATION DELIVERY LOG (optional, for debugging)
-- ============================================

CREATE TABLE notification_delivery_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,

  status TEXT NOT NULL, -- 'pending', 'delivered', 'failed'
  error TEXT,

  -- Response from delivery endpoint
  response_status INTEGER,
  response_body TEXT,

  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_log_notification ON notification_delivery_log(notification_id);
CREATE INDEX idx_delivery_log_channel ON notification_delivery_log(channel_id);
CREATE INDEX idx_delivery_log_status ON notification_delivery_log(status) WHERE status = 'failed';

-- RLS for delivery log (service role only, not user accessible)
ALTER TABLE notification_delivery_log ENABLE ROW LEVEL SECURITY;

-- No public access - service role only for auditing
CREATE POLICY "Delivery log not publicly accessible" ON notification_delivery_log
  FOR ALL USING (false);
