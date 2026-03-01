-- Payments runtime config: single-row table for admin-toggled payment pause.
-- Follows the same pattern as moderation_runtime_config (migration 007).

CREATE TABLE IF NOT EXISTS payments_runtime_config (
  id SMALLINT PRIMARY KEY,
  payments_paused BOOLEAN NOT NULL DEFAULT FALSE,
  pause_reason TEXT,
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_runtime_config_id_ck CHECK (id = 1)
);

-- Only one row ever exists (id = 1).
INSERT INTO payments_runtime_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Auto-update updated_at on every change.
CREATE OR REPLACE TRIGGER set_payments_runtime_config_updated_at
  BEFORE UPDATE ON payments_runtime_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Disable RLS: accessed only via service role from server-side code.
ALTER TABLE payments_runtime_config ENABLE ROW LEVEL SECURITY;
-- No RLS policies = service role only (anon/authenticated have no access).

COMMENT ON TABLE payments_runtime_config IS 'Single-row runtime config for payment pause state. Toggled from admin dashboard.';
