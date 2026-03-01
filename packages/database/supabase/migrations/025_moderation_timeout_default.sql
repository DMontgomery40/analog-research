-- Increase moderation timeout default to reduce unnecessary provider timeouts.

ALTER TABLE moderation_runtime_config
  ALTER COLUMN timeout_ms SET DEFAULT 8000;

UPDATE moderation_runtime_config
  SET timeout_ms = 8000
  WHERE id = 1
    AND timeout_ms = 1800;

