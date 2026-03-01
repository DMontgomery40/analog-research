-- Drop legacy conversation unread/last_message trigger.
--
-- The initial schema created `update_conversation_on_message` which calls
-- `update_conversation_last_message()` after every `messages` insert.
--
-- Migration 016 introduced the v1 trigger/function that handles unread counts and
-- `last_message_at` more defensively. Both triggers can coexist and would
-- double-increment unread counts.

DROP TRIGGER IF EXISTS update_conversation_on_message ON messages;
DROP FUNCTION IF EXISTS update_conversation_last_message();

