-- Atomic RPC for marking a booking's escrow as funded.
-- Combines booking update + transaction insert + notification insert in a
-- single transaction to prevent partial state from webhook races/crashes.

CREATE OR REPLACE FUNCTION mark_escrow_funded_atomic(
  p_booking_id UUID,
  p_payment_method TEXT,
  p_stripe_payment_intent_id TEXT DEFAULT NULL,
  p_coinbase_payment_id TEXT DEFAULT NULL,
  p_platform_fee INTEGER DEFAULT 0,
  p_processor_fee INTEGER DEFAULT 0,
  p_payer_amount INTEGER DEFAULT 0,
  p_escrow_amount INTEGER DEFAULT 0,
  p_currency TEXT DEFAULT 'USD',
  p_agent_id UUID DEFAULT NULL,
  p_human_id UUID DEFAULT NULL,
  p_booking_title TEXT DEFAULT NULL,
  p_crypto_tx_hash TEXT DEFAULT NULL
)
RETURNS TABLE (
  transitioned BOOLEAN,
  booking_status TEXT,
  escrow_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_transitioned BOOLEAN := FALSE;
BEGIN
  -- Lock the booking row to prevent concurrent updates.
  SELECT b.id, b.status, b.escrow_status, b.agent_id, b.human_id
  INTO v_booking
  FROM bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    transitioned := FALSE;
    booking_status := '';
    escrow_status := '';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Update payment metadata unconditionally (idempotent).
  UPDATE bookings SET
    payment_method = p_payment_method::payment_method,
    stripe_payment_intent_id = COALESCE(p_stripe_payment_intent_id, stripe_payment_intent_id),
    coinbase_payment_id = COALESCE(p_coinbase_payment_id, coinbase_payment_id),
    platform_fee = p_platform_fee,
    processor_fee = p_processor_fee,
    payer_amount = p_payer_amount
  WHERE id = p_booking_id;

  -- Only transition from pending -> funded.
  IF v_booking.escrow_status = 'pending' THEN
    UPDATE bookings SET
      escrow_status = 'funded',
      status = CASE
        WHEN v_booking.status = 'pending' THEN 'in_progress'
        ELSE v_booking.status
      END
    WHERE id = p_booking_id
      AND escrow_status = 'pending';

    IF FOUND THEN
      v_transitioned := TRUE;

      -- Insert transaction record (ON CONFLICT for idempotency).
      INSERT INTO transactions (
        booking_id, type, amount, currency, payment_method,
        crypto_tx_hash, from_agent_id, description
      ) VALUES (
        p_booking_id,
        'escrow_fund',
        p_escrow_amount,
        UPPER(COALESCE(NULLIF(p_currency, ''), 'USD')),
        p_payment_method::payment_method,
        p_crypto_tx_hash,
        COALESCE(p_agent_id, v_booking.agent_id),
        CASE
          WHEN p_payment_method = 'crypto' THEN 'Crypto escrow funded'
          ELSE 'Escrow funded'
        END
      )
      ON CONFLICT (booking_id, type) DO NOTHING;

      -- Insert notification for the human.
      INSERT INTO notifications (
        recipient_type, recipient_id, type, title, body, data
      ) VALUES (
        'human',
        COALESCE(p_human_id, v_booking.human_id),
        'escrow_funded',
        'Escrow funded - start work',
        'Escrow has been funded for "' || COALESCE(p_booking_title, 'your booking') || '". You can now start working.',
        jsonb_build_object('booking_id', p_booking_id)
      );
    END IF;
  END IF;

  transitioned := v_transitioned;
  booking_status := v_booking.status;
  escrow_status := v_booking.escrow_status;
  RETURN NEXT;
END;
$$;
