-- Coinbase crypto escrow support.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS coinbase_payment_link_id TEXT,
  ADD COLUMN IF NOT EXISTS coinbase_payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS coinbase_payment_id TEXT;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS coinbase_payment_operation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_coinbase_payment_link_id
  ON bookings(coinbase_payment_link_id);

CREATE INDEX IF NOT EXISTS idx_bookings_coinbase_payment_id
  ON bookings(coinbase_payment_id);

CREATE INDEX IF NOT EXISTS idx_transactions_coinbase_payment_operation_id
  ON transactions(coinbase_payment_operation_id);
