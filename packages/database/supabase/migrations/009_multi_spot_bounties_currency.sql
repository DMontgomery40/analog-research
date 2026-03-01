-- Multi-spot bounties + per-booking currency support.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bounty_pricing_mode') THEN
    CREATE TYPE bounty_pricing_mode AS ENUM ('bid', 'fixed_per_spot');
  END IF;
END $$;

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS spots_available INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS spots_filled INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_mode bounty_pricing_mode NOT NULL DEFAULT 'bid',
  ADD COLUMN IF NOT EXISTS fixed_spot_amount INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

UPDATE bounties
SET currency = UPPER(COALESCE(NULLIF(currency, ''), 'USD'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bounties_spots_available_range_ck'
  ) THEN
    ALTER TABLE bounties
      ADD CONSTRAINT bounties_spots_available_range_ck
      CHECK (spots_available BETWEEN 1 AND 500);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bounties_spots_filled_capacity_ck'
  ) THEN
    ALTER TABLE bounties
      ADD CONSTRAINT bounties_spots_filled_capacity_ck
      CHECK (spots_filled >= 0 AND spots_filled <= spots_available);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bounties_pricing_mode_amount_ck'
  ) THEN
    ALTER TABLE bounties
      ADD CONSTRAINT bounties_pricing_mode_amount_ck
      CHECK (
        (pricing_mode = 'bid' AND fixed_spot_amount IS NULL)
        OR (pricing_mode = 'fixed_per_spot' AND fixed_spot_amount IS NOT NULL AND fixed_spot_amount > 0)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bounties_currency_iso_ck'
  ) THEN
    ALTER TABLE bounties
      ADD CONSTRAINT bounties_currency_iso_ck
      CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS currency TEXT;

UPDATE bookings
SET currency = UPPER(COALESCE(NULLIF(currency, ''), 'USD'))
WHERE currency IS NULL OR currency = '' OR currency <> UPPER(currency);

ALTER TABLE bookings
  ALTER COLUMN currency SET DEFAULT 'USD',
  ALTER COLUMN currency SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_currency_iso_ck'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_currency_iso_ck
      CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS currency TEXT;

UPDATE transactions
SET currency = UPPER(COALESCE(NULLIF(currency, ''), 'USD'))
WHERE currency IS NULL OR currency = '' OR currency <> UPPER(currency);

ALTER TABLE transactions
  ALTER COLUMN currency SET DEFAULT 'USD',
  ALTER COLUMN currency SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_currency_iso_ck'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_currency_iso_ck
      CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bounties_currency_pricing_mode
  ON bounties(currency, pricing_mode);

CREATE INDEX IF NOT EXISTS idx_bounties_spot_capacity
  ON bounties(status, spots_available, spots_filled);

CREATE OR REPLACE FUNCTION accept_bounty_application_with_capacity(
  p_bounty_id UUID,
  p_application_id UUID,
  p_agent_id UUID
)
RETURNS TABLE (
  accepted BOOLEAN,
  reason TEXT,
  bounty_id UUID,
  application_id UUID,
  human_id UUID,
  proposed_rate INTEGER,
  estimated_hours NUMERIC,
  bounty_title TEXT,
  bounty_currency TEXT,
  pricing_mode bounty_pricing_mode,
  fixed_spot_amount INTEGER,
  spots_available INTEGER,
  spots_filled INTEGER,
  spots_remaining INTEGER,
  bounty_status bounty_status,
  application_status application_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bounty bounties%ROWTYPE;
  v_application applications%ROWTYPE;
  v_next_filled INTEGER;
BEGIN
  SELECT *
  INTO v_bounty
  FROM bounties
  WHERE id = p_bounty_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'bounty_not_found',
      p_bounty_id,
      p_application_id,
      NULL::UUID,
      NULL::INTEGER,
      NULL::NUMERIC,
      NULL::TEXT,
      NULL::TEXT,
      NULL::bounty_pricing_mode,
      NULL::INTEGER,
      0,
      0,
      0,
      NULL::bounty_status,
      NULL::application_status;
    RETURN;
  END IF;

  IF v_bounty.agent_id <> p_agent_id THEN
    RETURN QUERY SELECT
      FALSE,
      'forbidden',
      v_bounty.id,
      p_application_id,
      NULL::UUID,
      NULL::INTEGER,
      NULL::NUMERIC,
      v_bounty.title,
      v_bounty.currency,
      v_bounty.pricing_mode,
      v_bounty.fixed_spot_amount,
      v_bounty.spots_available,
      v_bounty.spots_filled,
      GREATEST(v_bounty.spots_available - v_bounty.spots_filled, 0),
      v_bounty.status,
      NULL::application_status;
    RETURN;
  END IF;

  SELECT *
  INTO v_application
  FROM applications
  WHERE id = p_application_id
    AND bounty_id = p_bounty_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'application_not_found',
      v_bounty.id,
      p_application_id,
      NULL::UUID,
      NULL::INTEGER,
      NULL::NUMERIC,
      v_bounty.title,
      v_bounty.currency,
      v_bounty.pricing_mode,
      v_bounty.fixed_spot_amount,
      v_bounty.spots_available,
      v_bounty.spots_filled,
      GREATEST(v_bounty.spots_available - v_bounty.spots_filled, 0),
      v_bounty.status,
      NULL::application_status;
    RETURN;
  END IF;

  IF v_application.status = 'accepted' THEN
    RETURN QUERY SELECT
      TRUE,
      'already_accepted',
      v_bounty.id,
      v_application.id,
      v_application.human_id,
      v_application.proposed_rate,
      v_application.estimated_hours,
      v_bounty.title,
      v_bounty.currency,
      v_bounty.pricing_mode,
      v_bounty.fixed_spot_amount,
      v_bounty.spots_available,
      v_bounty.spots_filled,
      GREATEST(v_bounty.spots_available - v_bounty.spots_filled, 0),
      v_bounty.status,
      v_application.status;
    RETURN;
  END IF;

  IF v_application.status <> 'pending' THEN
    RETURN QUERY SELECT
      FALSE,
      'application_not_pending',
      v_bounty.id,
      v_application.id,
      v_application.human_id,
      v_application.proposed_rate,
      v_application.estimated_hours,
      v_bounty.title,
      v_bounty.currency,
      v_bounty.pricing_mode,
      v_bounty.fixed_spot_amount,
      v_bounty.spots_available,
      v_bounty.spots_filled,
      GREATEST(v_bounty.spots_available - v_bounty.spots_filled, 0),
      v_bounty.status,
      v_application.status;
    RETURN;
  END IF;

  IF v_bounty.status <> 'open' THEN
    RETURN QUERY SELECT
      FALSE,
      'bounty_not_open',
      v_bounty.id,
      v_application.id,
      v_application.human_id,
      v_application.proposed_rate,
      v_application.estimated_hours,
      v_bounty.title,
      v_bounty.currency,
      v_bounty.pricing_mode,
      v_bounty.fixed_spot_amount,
      v_bounty.spots_available,
      v_bounty.spots_filled,
      GREATEST(v_bounty.spots_available - v_bounty.spots_filled, 0),
      v_bounty.status,
      v_application.status;
    RETURN;
  END IF;

  IF v_bounty.spots_filled >= v_bounty.spots_available THEN
    RETURN QUERY SELECT
      FALSE,
      'bounty_full',
      v_bounty.id,
      v_application.id,
      v_application.human_id,
      v_application.proposed_rate,
      v_application.estimated_hours,
      v_bounty.title,
      v_bounty.currency,
      v_bounty.pricing_mode,
      v_bounty.fixed_spot_amount,
      v_bounty.spots_available,
      v_bounty.spots_filled,
      0,
      v_bounty.status,
      v_application.status;
    RETURN;
  END IF;

  UPDATE applications
  SET status = 'accepted'
  WHERE id = v_application.id;

  v_next_filled := v_bounty.spots_filled + 1;

  UPDATE bounties
  SET
    spots_filled = v_next_filled,
    status = CASE
      WHEN v_next_filled >= spots_available THEN 'in_progress'::bounty_status
      ELSE 'open'::bounty_status
    END
  WHERE id = v_bounty.id
  RETURNING * INTO v_bounty;

  SELECT *
  INTO v_application
  FROM applications
  WHERE id = v_application.id;

  RETURN QUERY SELECT
    TRUE,
    'accepted',
    v_bounty.id,
    v_application.id,
    v_application.human_id,
    v_application.proposed_rate,
    v_application.estimated_hours,
    v_bounty.title,
    v_bounty.currency,
    v_bounty.pricing_mode,
    v_bounty.fixed_spot_amount,
    v_bounty.spots_available,
    v_bounty.spots_filled,
    GREATEST(v_bounty.spots_available - v_bounty.spots_filled, 0),
    v_bounty.status,
    v_application.status;
END;
$$;
