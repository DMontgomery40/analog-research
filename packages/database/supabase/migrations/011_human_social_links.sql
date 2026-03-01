-- Add canonical social links to human profiles with mirrored dedicated columns.

ALTER TABLE humans
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS github_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT;

CREATE OR REPLACE FUNCTION public.humans_social_links_allowed_keys(input_links JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_object_keys(COALESCE(input_links, '{}'::jsonb)) AS key
    WHERE key NOT IN ('github', 'linkedin', 'instagram', 'youtube', 'website')
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'humans_social_links_object_ck'
  ) THEN
    ALTER TABLE humans
      ADD CONSTRAINT humans_social_links_object_ck
      CHECK (jsonb_typeof(social_links) = 'object');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'humans_social_links_allowed_keys_ck'
  ) THEN
    ALTER TABLE humans
      ADD CONSTRAINT humans_social_links_allowed_keys_ck
      CHECK (public.humans_social_links_allowed_keys(social_links));
  END IF;
END $$;
