-- Create the 'models' storage bucket if it doesn't exist
-- This bucket stores trained ML model files (.pkl) and metadata

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('models', 'models', false, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policy for models bucket
-- Allow authenticated users to read and write model files
CREATE POLICY IF NOT EXISTS "Allow authenticated users to read models"
ON storage.objects FOR SELECT
USING (bucket_id = 'models' AND auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Allow authenticated users to upload models"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'models' AND auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Allow authenticated users to update models"
ON storage.objects FOR UPDATE
USING (bucket_id = 'models' AND auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Allow authenticated users to delete models"
ON storage.objects FOR DELETE
USING (bucket_id = 'models' AND auth.role() = 'authenticated');

