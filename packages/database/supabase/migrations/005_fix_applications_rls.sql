-- Replace insecure applications SELECT policy with applicant-scoped access.
DROP POLICY IF EXISTS "Applications are readable by bounty owner and applicant" ON applications;

CREATE POLICY "Applications are readable by applicant" ON applications
  FOR SELECT USING (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );
