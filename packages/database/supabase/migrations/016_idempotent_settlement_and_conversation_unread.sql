-- Idempotent booking settlement + conversation unread count correctness.
--
-- Goals:
-- 1) Prevent duplicate ledger entries for critical transaction types under concurrency.
-- 2) Make booking settlement idempotent and atomic for stats updates.
-- 3) Ensure conversation unread counters + last_message_at update on every new message.

-- ============================================
-- TRANSACTIONS: DEDUPE + UNIQUENESS
-- ============================================

-- If duplicates already exist, keep the earliest row per booking/type and delete the rest.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY booking_id, type
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM transactions
  WHERE type IN ('escrow_fund', 'escrow_release', 'escrow_refund', 'platform_fee')
)
DELETE FROM transactions
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- Enforce "one row per booking" for the critical transaction types.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_one_escrow_fund_per_booking
  ON transactions(booking_id)
  WHERE type = 'escrow_fund';

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_one_escrow_release_per_booking
  ON transactions(booking_id)
  WHERE type = 'escrow_release';

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_one_escrow_refund_per_booking
  ON transactions(booking_id)
  WHERE type = 'escrow_refund';

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_one_platform_fee_per_booking
  ON transactions(booking_id)
  WHERE type = 'platform_fee';

-- ============================================
-- RPC: ENSURE SETTLEMENT RECORDS (IDEMPOTENT)
-- ============================================

CREATE OR REPLACE FUNCTION ensure_booking_settlement_records_v1(
  p_booking_id UUID,
  p_agent_id UUID,
  p_human_id UUID,
  p_amount INTEGER,
  p_platform_fee INTEGER,
  p_currency TEXT,
  p_payment_method payment_method,
  p_crypto_tx_hash TEXT DEFAULT NULL,
  p_escrow_release_description TEXT DEFAULT NULL,
  p_platform_fee_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  inserted_escrow_release BOOLEAN,
  inserted_platform_fee BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_human_payout INTEGER;
  v_inserted_escrow_release BOOLEAN := FALSE;
  v_inserted_platform_fee BOOLEAN := FALSE;
  v_escrow_release_id UUID;
  v_platform_fee_id UUID;
BEGIN
  v_human_payout := p_amount - p_platform_fee;

  -- Insert escrow release (idempotent under unique index).
  INSERT INTO transactions (
    booking_id,
    type,
    amount,
    currency,
    payment_method,
    crypto_tx_hash,
    from_agent_id,
    to_human_id,
    description
  ) VALUES (
    p_booking_id,
    'escrow_release',
    v_human_payout,
    UPPER(COALESCE(NULLIF(p_currency, ''), 'USD')),
    p_payment_method,
    p_crypto_tx_hash,
    p_agent_id,
    p_human_id,
    COALESCE(p_escrow_release_description, 'Escrow released for completed work')
  )
  ON CONFLICT (booking_id) WHERE (type = 'escrow_release')
  DO NOTHING
  RETURNING id INTO v_escrow_release_id;

  IF v_escrow_release_id IS NOT NULL THEN
    v_inserted_escrow_release := TRUE;
  END IF;

  -- Insert platform fee (idempotent under unique index).
  INSERT INTO transactions (
    booking_id,
    type,
    amount,
    currency,
    payment_method,
    crypto_tx_hash,
    from_agent_id,
    description
  ) VALUES (
    p_booking_id,
    'platform_fee',
    p_platform_fee,
    UPPER(COALESCE(NULLIF(p_currency, ''), 'USD')),
    p_payment_method,
    p_crypto_tx_hash,
    p_agent_id,
    COALESCE(p_platform_fee_description, 'Platform fee (3%)')
  )
  ON CONFLICT (booking_id) WHERE (type = 'platform_fee')
  DO NOTHING
  RETURNING id INTO v_platform_fee_id;

  IF v_platform_fee_id IS NOT NULL THEN
    v_inserted_platform_fee := TRUE;
  END IF;

  -- Only update completion stats once, on first successful escrow_release insert.
  IF v_inserted_escrow_release THEN
    UPDATE humans
    SET
      total_earnings = COALESCE(total_earnings, 0) + v_human_payout,
      completed_bookings = COALESCE(completed_bookings, 0) + 1
    WHERE id = p_human_id;

    UPDATE agents
    SET
      total_spent = COALESCE(total_spent, 0) + p_amount,
      total_bookings = COALESCE(total_bookings, 0) + 1
    WHERE id = p_agent_id;
  END IF;

  inserted_escrow_release := v_inserted_escrow_release;
  inserted_platform_fee := v_inserted_platform_fee;
  RETURN NEXT;
END;
$$;

-- ============================================
-- MESSAGES: UNREAD COUNTS + LAST_MESSAGE_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_conversation_on_message_insert_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE conversations
  SET
    last_message_at = GREATEST(COALESCE(last_message_at, NEW.created_at), NEW.created_at),
    human_unread_count = CASE
      WHEN NEW.sender_type = 'agent' THEN COALESCE(human_unread_count, 0) + 1
      ELSE COALESCE(human_unread_count, 0)
    END,
    agent_unread_count = CASE
      WHEN NEW.sender_type = 'human' THEN COALESCE(agent_unread_count, 0) + 1
      ELSE COALESCE(agent_unread_count, 0)
    END
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_unread_on_message_insert_v1 ON messages;

CREATE TRIGGER conversations_unread_on_message_insert_v1
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message_insert_v1();

