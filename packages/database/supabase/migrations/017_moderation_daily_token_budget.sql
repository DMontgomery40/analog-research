-- Enforce moderation daily token budget (best-effort, concurrency-safe reservation).
--
-- The moderation runtime config includes `daily_token_budget`, but the app needs
-- a shared counter to prevent runaway LLM spend under concurrency.

CREATE TABLE IF NOT EXISTS moderation_daily_token_usage (
  usage_date DATE PRIMARY KEY,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service role only (consistent with other moderation tables).
ALTER TABLE moderation_daily_token_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION try_consume_moderation_tokens_v1(
  p_tokens BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_budget BIGINT;
  v_used BIGINT;
  v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
BEGIN
  IF p_tokens IS NULL OR p_tokens <= 0 THEN
    RETURN TRUE;
  END IF;

  SELECT daily_token_budget
  INTO v_budget
  FROM moderation_runtime_config
  WHERE id = 1;

  -- If config row is missing, allow (misconfiguration).
  IF v_budget IS NULL THEN
    RETURN TRUE;
  END IF;

  INSERT INTO moderation_daily_token_usage (usage_date, tokens_used)
  VALUES (v_today, 0)
  ON CONFLICT (usage_date) DO NOTHING;

  SELECT tokens_used
  INTO v_used
  FROM moderation_daily_token_usage
  WHERE usage_date = v_today
  FOR UPDATE;

  IF v_used + p_tokens > v_budget THEN
    RETURN FALSE;
  END IF;

  UPDATE moderation_daily_token_usage
  SET
    tokens_used = tokens_used + p_tokens,
    updated_at = NOW()
  WHERE usage_date = v_today;

  RETURN TRUE;
END;
$$;

