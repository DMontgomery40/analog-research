-- Restrict mark_escrow_funded_atomic execution to service_role only.
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION mark_escrow_funded_atomic FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION mark_escrow_funded_atomic FROM anon;
  REVOKE EXECUTE ON FUNCTION mark_escrow_funded_atomic FROM authenticated;
  GRANT EXECUTE ON FUNCTION mark_escrow_funded_atomic TO service_role;
END
$$;
