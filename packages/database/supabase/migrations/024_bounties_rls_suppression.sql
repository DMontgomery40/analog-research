-- Enforce bounty spam suppression at the DB/RLS layer.
-- Bounties remain publicly readable, but suppressed rows are hidden unless the
-- requesting dashboard session proves ownership via current_owner_agent_ids().

DROP POLICY IF EXISTS "Bounties are publicly readable" ON bounties;

CREATE POLICY "Bounties are publicly readable (unsuppressed or owner)" ON bounties
  FOR SELECT USING (
    COALESCE(is_spam_suppressed, FALSE) = FALSE
    OR agent_id IN (SELECT * FROM current_owner_agent_ids())
  );

