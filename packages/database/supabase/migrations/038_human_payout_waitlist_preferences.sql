-- Human payout waitlist preferences (PayPal/Venmo coming soon).
-- Stores waitlist intent only, no payout destination identifiers.

CREATE TABLE IF NOT EXISTS human_payout_waitlist_preferences (
  human_id UUID PRIMARY KEY REFERENCES humans(id) ON DELETE CASCADE,
  paypal_waitlist BOOLEAN NOT NULL DEFAULT FALSE,
  venmo_waitlist BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_human_payout_waitlist_preferences_updated_at ON human_payout_waitlist_preferences;
CREATE TRIGGER update_human_payout_waitlist_preferences_updated_at
  BEFORE UPDATE ON human_payout_waitlist_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE human_payout_waitlist_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Human payout waitlist preferences readable by owner" ON human_payout_waitlist_preferences;
CREATE POLICY "Human payout waitlist preferences readable by owner" ON human_payout_waitlist_preferences
  FOR SELECT USING (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Human payout waitlist preferences writable by owner" ON human_payout_waitlist_preferences;
CREATE POLICY "Human payout waitlist preferences writable by owner" ON human_payout_waitlist_preferences
  FOR INSERT WITH CHECK (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Human payout waitlist preferences updatable by owner" ON human_payout_waitlist_preferences;
CREATE POLICY "Human payout waitlist preferences updatable by owner" ON human_payout_waitlist_preferences
  FOR UPDATE USING (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  )
  WITH CHECK (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Human payout waitlist preferences deletable by owner" ON human_payout_waitlist_preferences;
CREATE POLICY "Human payout waitlist preferences deletable by owner" ON human_payout_waitlist_preferences
  FOR DELETE USING (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );
