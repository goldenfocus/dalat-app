-- ============================================
-- PLAYLIST STORAGE SUPPORT
-- Migration: 20260614_001_playlist_storage
-- ============================================
-- Adds audio MIME types to event-media bucket and updates
-- storage policies to support playlist uploads.

-- Add audio MIME types and increase file size limit for audio files
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    -- Images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    -- Videos
    'video/mp4',
    'video/webm',
    'video/quicktime',
    -- Audio
    'audio/mpeg',      -- MP3
    'audio/mp4',       -- M4A, AAC
    'audio/x-m4a',     -- M4A
    'audio/wav',       -- WAV
    'audio/ogg',       -- OGG
    'audio/webm',      -- WebM audio
    'audio/aac'        -- AAC
  ],
  file_size_limit = 104857600  -- 100MB for audio files
WHERE id = 'event-media';

-- Helper function to check if user can upload to playlist folder
-- Storage path format for playlists: playlists/{event_id}/{filename}
CREATE OR REPLACE FUNCTION public.can_upload_playlist_media(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM events e
    WHERE
      -- Path starts with 'playlists/'
      object_name LIKE 'playlists/%'
      -- Extract event_id from path (second folder component)
      AND e.id = (string_to_array(object_name, '/'))[2]::uuid
      -- User is organizer, creator, or admin
      AND (
        e.organizer_id = auth.uid()
        OR e.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid()
          AND role IN ('admin', 'superadmin')
        )
      )
  );
$$;

-- Drop old playlist-specific policies if they exist
DROP POLICY IF EXISTS "Playlist media upload" ON storage.objects;
DROP POLICY IF EXISTS "Playlist media update" ON storage.objects;
DROP POLICY IF EXISTS "Playlist media delete" ON storage.objects;

-- Allow playlist uploads
CREATE POLICY "Playlist media upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-media'
  AND name LIKE 'playlists/%'
  AND public.can_upload_playlist_media(name)
);

-- Allow playlist media updates
CREATE POLICY "Playlist media update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-media'
  AND name LIKE 'playlists/%'
  AND public.can_upload_playlist_media(name)
)
WITH CHECK (
  bucket_id = 'event-media'
  AND name LIKE 'playlists/%'
  AND public.can_upload_playlist_media(name)
);

-- Allow playlist media deletion
CREATE POLICY "Playlist media delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-media'
  AND name LIKE 'playlists/%'
  AND public.can_upload_playlist_media(name)
);

COMMENT ON FUNCTION public.can_upload_playlist_media IS
'Checks if the current user can upload media to a playlist folder.
Path format: playlists/{event_id}/{filename}
Allows: event organizer, event creator, or admin/superadmin.';
