-- Add notification_type enum value needed for Stripe refunds.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_type' AND e.enumlabel = 'payment_refunded'
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'payment_refunded';
  END IF;
END $$;

