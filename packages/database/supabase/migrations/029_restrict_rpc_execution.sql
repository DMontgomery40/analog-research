-- Lock down accept_bounty_application_with_capacity so only service_role
-- (the Next.js API using SUPABASE_SERVICE_ROLE_KEY) can execute it.
-- Prevents direct PostgREST invocation with arbitrary p_agent_id.

REVOKE EXECUTE ON FUNCTION accept_bounty_application_with_capacity(UUID, UUID, UUID)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION accept_bounty_application_with_capacity(UUID, UUID, UUID)
  FROM anon;
REVOKE EXECUTE ON FUNCTION accept_bounty_application_with_capacity(UUID, UUID, UUID)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION accept_bounty_application_with_capacity(UUID, UUID, UUID)
  TO service_role;
