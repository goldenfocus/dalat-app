-- Event media storage bucket and policies
-- Supports images (JPEG, PNG, WebP, GIF) and videos (MP4, WebM)

-- Create the event-media bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-media',
  'event-media',
  true,  -- Public bucket for easy display
  52428800,  -- 50MB limit (for video)
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Helper function to check if user is the event creator
-- Storage path format: {event_id}/{timestamp}.{ext}
CREATE OR REPLACE FUNCTION public.is_event_media_owner(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM events
    WHERE id = (storage.foldername(object_name))[1]::uuid
    AND created_by = auth.uid()
  );
$$;

-- Storage policies for event-media bucket

-- Allow event creators to upload media to their event folder
CREATE POLICY "Event creator can upload media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-media' AND
  public.is_event_media_owner(name)
);

-- Allow event creators to update their event media
CREATE POLICY "Event creator can update media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-media' AND
  public.is_event_media_owner(name)
)
WITH CHECK (
  bucket_id = 'event-media' AND
  public.is_event_media_owner(name)
);

-- Allow event creators to delete their event media
CREATE POLICY "Event creator can delete media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-media' AND
  public.is_event_media_owner(name)
);

-- Allow public read access to all event media
CREATE POLICY "Anyone can view event media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-media');
