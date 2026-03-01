-- Tighten the proofs INSERT policy to also validate that the booking_id
-- belongs to a booking where the authenticated human is the assigned worker.
-- Previously only human_id was checked, allowing cross-booking proof injection.

DROP POLICY IF EXISTS "Humans can submit proofs" ON proofs;

CREATE POLICY "Humans can submit proofs" ON proofs
  FOR INSERT WITH CHECK (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    AND booking_id IN (
      SELECT id FROM bookings
      WHERE human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    )
  );
