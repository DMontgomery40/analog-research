-- Ensure storage bucket + baseline policies for proof/message attachments uploads.
-- Frontend uploads to bucket `proof-attachments` before creating proof/message records.

INSERT INTO storage.buckets (id, name, public)
VALUES ('proof-attachments', 'proof-attachments', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Proof attachments upload (authenticated)'
  ) THEN
    CREATE POLICY "Proof attachments upload (authenticated)"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'proof-attachments'
        AND auth.uid() IS NOT NULL
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Proof attachments read own objects'
  ) THEN
    CREATE POLICY "Proof attachments read own objects"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'proof-attachments'
        AND owner = auth.uid()
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Proof attachments delete own objects'
  ) THEN
    CREATE POLICY "Proof attachments delete own objects"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'proof-attachments'
        AND owner = auth.uid()
      );
  END IF;
END $$;
