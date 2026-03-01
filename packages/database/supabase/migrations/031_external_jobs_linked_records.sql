-- Link external jobs to core marketplace records (bounty/booking/application/conversation)
-- while enforcing same-molty ownership invariants.

ALTER TABLE external_jobs
  ADD COLUMN IF NOT EXISTS bounty_id UUID REFERENCES bounties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_external_jobs_agent_bounty_created
  ON external_jobs (agent_id, bounty_id, created_at DESC)
  WHERE bounty_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_external_jobs_agent_booking_created
  ON external_jobs (agent_id, booking_id, created_at DESC)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_external_jobs_agent_application_created
  ON external_jobs (agent_id, application_id, created_at DESC)
  WHERE application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_external_jobs_agent_conversation_created
  ON external_jobs (agent_id, conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_external_job_links()
RETURNS TRIGGER AS $$
DECLARE
  linked_agent_id UUID;
  booking_bounty_id UUID;
  booking_application_id UUID;
  application_bounty_id UUID;
BEGIN
  IF NEW.bounty_id IS NOT NULL THEN
    SELECT b.agent_id
    INTO linked_agent_id
    FROM bounties b
    WHERE b.id = NEW.bounty_id;

    IF linked_agent_id IS NULL THEN
      RAISE EXCEPTION 'external_jobs.bounty_id references a missing bounty';
    END IF;

    IF linked_agent_id <> NEW.agent_id THEN
      RAISE EXCEPTION 'external_jobs.bounty_id must belong to same agent_id';
    END IF;
  END IF;

  IF NEW.booking_id IS NOT NULL THEN
    SELECT bk.agent_id, bk.bounty_id, bk.application_id
    INTO linked_agent_id, booking_bounty_id, booking_application_id
    FROM bookings bk
    WHERE bk.id = NEW.booking_id;

    IF linked_agent_id IS NULL THEN
      RAISE EXCEPTION 'external_jobs.booking_id references a missing booking';
    END IF;

    IF linked_agent_id <> NEW.agent_id THEN
      RAISE EXCEPTION 'external_jobs.booking_id must belong to same agent_id';
    END IF;

    IF NEW.bounty_id IS NOT NULL AND booking_bounty_id IS NOT NULL AND booking_bounty_id <> NEW.bounty_id THEN
      RAISE EXCEPTION 'external_jobs.booking_id conflicts with bounty_id';
    END IF;

    IF NEW.application_id IS NOT NULL AND booking_application_id IS NOT NULL AND booking_application_id <> NEW.application_id THEN
      RAISE EXCEPTION 'external_jobs.booking_id conflicts with application_id';
    END IF;
  END IF;

  IF NEW.application_id IS NOT NULL THEN
    SELECT a.bounty_id
    INTO application_bounty_id
    FROM applications a
    WHERE a.id = NEW.application_id;

    IF application_bounty_id IS NULL THEN
      RAISE EXCEPTION 'external_jobs.application_id references a missing application';
    END IF;

    SELECT b.agent_id
    INTO linked_agent_id
    FROM bounties b
    WHERE b.id = application_bounty_id;

    IF linked_agent_id IS NULL OR linked_agent_id <> NEW.agent_id THEN
      RAISE EXCEPTION 'external_jobs.application_id must belong to same agent_id';
    END IF;

    IF NEW.bounty_id IS NOT NULL AND application_bounty_id <> NEW.bounty_id THEN
      RAISE EXCEPTION 'external_jobs.application_id conflicts with bounty_id';
    END IF;
  END IF;

  IF NEW.conversation_id IS NOT NULL THEN
    SELECT c.agent_id
    INTO linked_agent_id
    FROM conversations c
    WHERE c.id = NEW.conversation_id;

    IF linked_agent_id IS NULL THEN
      RAISE EXCEPTION 'external_jobs.conversation_id references a missing conversation';
    END IF;

    IF linked_agent_id <> NEW.agent_id THEN
      RAISE EXCEPTION 'external_jobs.conversation_id must belong to same agent_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_external_job_links_before_write ON external_jobs;

CREATE TRIGGER validate_external_job_links_before_write
  BEFORE INSERT OR UPDATE ON external_jobs
  FOR EACH ROW
  EXECUTE FUNCTION validate_external_job_links();
