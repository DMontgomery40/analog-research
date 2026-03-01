-- Stripe Connect sample mapping table.
-- Stores a mapping from authenticated user -> connected account id for the admin/sample flow.

CREATE TABLE IF NOT EXISTS stripe_connect_sample_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_stripe_connect_sample_accounts_user_id
  ON stripe_connect_sample_accounts(user_id);

DROP TRIGGER IF EXISTS update_stripe_connect_sample_accounts_updated_at
  ON stripe_connect_sample_accounts;

CREATE TRIGGER update_stripe_connect_sample_accounts_updated_at
  BEFORE UPDATE ON stripe_connect_sample_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE stripe_connect_sample_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read Stripe Connect sample accounts"
  ON stripe_connect_sample_accounts;
CREATE POLICY "Owners can read Stripe Connect sample accounts"
  ON stripe_connect_sample_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can insert Stripe Connect sample accounts"
  ON stripe_connect_sample_accounts;
CREATE POLICY "Owners can insert Stripe Connect sample accounts"
  ON stripe_connect_sample_accounts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can update Stripe Connect sample accounts"
  ON stripe_connect_sample_accounts;
CREATE POLICY "Owners can update Stripe Connect sample accounts"
  ON stripe_connect_sample_accounts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
