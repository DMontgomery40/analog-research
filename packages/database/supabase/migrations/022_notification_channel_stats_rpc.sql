-- Notification channel delivery stats RPC helpers.
-- These are called server-side (service role) from apps/web to keep per-channel counters up to date.

-- ============================================
-- RPC: INCREMENT CHANNEL DELIVERY COUNT
-- ============================================

CREATE OR REPLACE FUNCTION increment_channel_delivery_count(
  p_channel_id UUID
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE notification_channels
  SET
    delivery_count = COALESCE(delivery_count, 0) + 1,
    last_delivered_at = NOW(),
    last_error = NULL
  WHERE id = p_channel_id;
$$;

-- ============================================
-- RPC: INCREMENT CHANNEL FAILURE COUNT
-- ============================================

CREATE OR REPLACE FUNCTION increment_channel_failure_count(
  p_channel_id UUID,
  p_error TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE notification_channels
  SET
    failure_count = COALESCE(failure_count, 0) + 1,
    last_error = CASE
      WHEN p_error IS NULL OR btrim(p_error) = '' THEN last_error
      ELSE p_error
    END
  WHERE id = p_channel_id;
END;
$$;

