-- Booking fee breakdown + settlement v2.
--
-- IMPORTANT INVARIANT:
-- - bookings.amount remains the job subtotal in minor units (e.g. cents).
--
-- Fee breakdown columns:
-- - payer_amount: total charged to the payer (Stripe: subtotal + processor_fee; Crypto: equals subtotal)
-- - processor_fee: payer-paid processing fee (Stripe only; 0 for crypto)
--
-- We keep payer_amount consistent via a trigger so inserts/updates don't need to manually
-- maintain payer_amount = amount + processor_fee.

-- ============================================
-- BOOKINGS: FEE BREAKDOWN COLUMNS
-- ============================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payer_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processor_fee INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_url TEXT;

COMMENT ON COLUMN public.bookings.amount IS 'Job subtotal in minor units (e.g. cents).';
COMMENT ON COLUMN public.bookings.payer_amount IS 'Total charged to payer in minor units. Stripe: amount + processor_fee. Crypto: equals amount.';
COMMENT ON COLUMN public.bookings.processor_fee IS 'Payer-paid processing fee in minor units (Stripe only; 0 for crypto).';
COMMENT ON COLUMN public.bookings.stripe_checkout_session_id IS 'Stripe Checkout Session id used to fund escrow.';
COMMENT ON COLUMN public.bookings.stripe_checkout_url IS 'Stripe Checkout Session URL used to fund escrow.';

CREATE OR REPLACE FUNCTION public.bookings_sync_payer_amount_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.payer_amount := NEW.amount + NEW.processor_fee;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_sync_payer_amount_v1 ON public.bookings;

CREATE TRIGGER bookings_sync_payer_amount_v1
BEFORE INSERT OR UPDATE OF amount, processor_fee ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_sync_payer_amount_v1();

-- Backfill existing rows so the invariants hold before adding CHECK constraints.
UPDATE public.bookings
SET
  processor_fee = COALESCE(processor_fee, 0),
  payer_amount = amount + COALESCE(processor_fee, 0);

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_processor_fee_nonnegative CHECK (processor_fee >= 0),
  ADD CONSTRAINT bookings_payer_amount_nonnegative CHECK (payer_amount >= 0),
  ADD CONSTRAINT bookings_payer_amount_consistent CHECK (payer_amount = amount + processor_fee);

-- ============================================
-- RPC: ENSURE SETTLEMENT RECORDS (IDEMPOTENT) v2
-- ============================================

CREATE OR REPLACE FUNCTION ensure_booking_settlement_records_v2(
  p_booking_id UUID,
  p_agent_id UUID,
  p_human_id UUID,
  p_amount INTEGER,
  p_platform_fee INTEGER,
  p_currency TEXT,
  p_payment_method payment_method,
  p_payer_amount INTEGER,
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
      total_spent = COALESCE(total_spent, 0) + p_payer_amount,
      total_bookings = COALESCE(total_bookings, 0) + 1
    WHERE id = p_agent_id;
  END IF;

  inserted_escrow_release := v_inserted_escrow_release;
  inserted_platform_fee := v_inserted_platform_fee;
  RETURN NEXT;
END;
$$;
