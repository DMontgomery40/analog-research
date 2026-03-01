-- Prevent non-privileged users from tampering with system-managed columns
-- on the humans table. Service-role callers (webhooks, settlement, admin)
-- are allowed to update any column.

CREATE OR REPLACE FUNCTION guard_human_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Privileged roles bypass the guard.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Overwrite protected columns with their existing values.
  NEW.is_verified := OLD.is_verified;
  NEW.verified_at := OLD.verified_at;
  NEW.stripe_account_id := OLD.stripe_account_id;
  NEW.stripe_onboarding_complete := OLD.stripe_onboarding_complete;
  NEW.wallet_address := OLD.wallet_address;
  NEW.total_earnings := OLD.total_earnings;
  NEW.completed_bookings := OLD.completed_bookings;
  NEW.rating_average := OLD.rating_average;
  NEW.rating_count := OLD.rating_count;
  NEW.user_id := OLD.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_human_system_columns_trigger ON humans;
CREATE TRIGGER guard_human_system_columns_trigger
  BEFORE UPDATE ON humans
  FOR EACH ROW EXECUTE FUNCTION guard_human_system_columns();
