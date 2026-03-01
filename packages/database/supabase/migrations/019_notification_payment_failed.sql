-- Add notification_type enum values needed for Stripe failure notifications

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_type' AND e.enumlabel = 'payment_failed'
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'payment_failed';
  END IF;
END $$;

