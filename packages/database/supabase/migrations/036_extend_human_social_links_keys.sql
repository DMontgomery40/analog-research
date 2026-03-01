-- Extend allowed social_links keys for humans profiles.

CREATE OR REPLACE FUNCTION public.humans_social_links_allowed_keys(input_links JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_object_keys(COALESCE(input_links, '{}'::jsonb)) AS key
    WHERE key NOT IN (
      'github',
      'linkedin',
      'instagram',
      'youtube',
      'website',
      'x',
      'website_2',
      'website_3',
      'contact_email'
    )
  );
$$;
