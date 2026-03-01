-- Restrict anon role to safe public-facing columns only.
-- Sensitive fields (Stripe IDs, wallet addresses, earnings, user linkage)
-- are no longer readable via PostgREST with the anon key.

REVOKE ALL ON humans FROM anon;

GRANT SELECT (
  id,
  name,
  bio,
  avatar_url,
  location,
  timezone,
  skills,
  rate_min,
  rate_max,
  availability,
  rating_average,
  rating_count,
  is_verified,
  created_at
) ON humans TO anon;
