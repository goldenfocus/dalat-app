-- Add YouTube and material (PDF, audio, document) support to moments
-- This enables sharing YouTube livestreams and uploaded files in event moments

-- ============================================
-- STEP 1: Add new columns to moments table
-- ============================================

-- YouTube fields
ALTER TABLE moments
ADD COLUMN IF NOT EXISTS youtube_url TEXT,
ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;

-- Material/file fields (for PDF, audio, documents)
ALTER TABLE moments
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS original_filename TEXT,
ADD COLUMN IF NOT EXISTS file_size BIGINT,
ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- Audio-specific metadata (ID3 tags)
ALTER TABLE moments
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS artist TEXT,
ADD COLUMN IF NOT EXISTS album TEXT,
ADD COLUMN IF NOT EXISTS audio_duration_seconds INT,
ADD COLUMN IF NOT EXISTS audio_thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS track_number TEXT,
ADD COLUMN IF NOT EXISTS release_year INT,
ADD COLUMN IF NOT EXISTS genre TEXT;

-- ============================================
-- STEP 2: Update content_type constraint
-- ============================================

-- Drop old constraint
ALTER TABLE moments DROP CONSTRAINT IF EXISTS moments_content_type_check;

-- Add new constraint with expanded content types
ALTER TABLE moments ADD CONSTRAINT moments_content_type_check
CHECK (content_type IN ('photo', 'video', 'text', 'youtube', 'pdf', 'audio', 'document', 'image'));

-- ============================================
-- STEP 3: Update content validation constraint
-- ============================================

-- Drop old constraint
ALTER TABLE moments DROP CONSTRAINT IF EXISTS moments_content_check;

-- Add new constraint that validates based on content type
ALTER TABLE moments ADD CONSTRAINT moments_content_check CHECK (
  CASE
    -- Photo/video require media_url or Cloudflare Stream
    WHEN content_type IN ('photo', 'video', 'image') THEN
      media_url IS NOT NULL OR cf_video_uid IS NOT NULL
    -- Text requires text_content
    WHEN content_type = 'text' THEN
      text_content IS NOT NULL
    -- YouTube requires youtube_video_id
    WHEN content_type = 'youtube' THEN
      youtube_video_id IS NOT NULL
    -- PDF, audio, document require file_url
    WHEN content_type IN ('pdf', 'audio', 'document') THEN
      file_url IS NOT NULL
    ELSE true
  END
);

-- ============================================
-- STEP 4: Update create_moment function
-- ============================================

-- Drop old function signatures
DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text);

CREATE OR REPLACE FUNCTION create_moment(
  p_event_id uuid,
  p_content_type text,
  p_media_url text DEFAULT NULL,
  p_text_content text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_source_locale text DEFAULT 'en',
  p_thumbnail_url text DEFAULT NULL,
  p_cf_video_uid text DEFAULT NULL,
  p_cf_playback_url text DEFAULT NULL,
  p_video_status text DEFAULT 'ready',
  -- YouTube fields
  p_youtube_url text DEFAULT NULL,
  p_youtube_video_id text DEFAULT NULL,
  -- Material/file fields
  p_file_url text DEFAULT NULL,
  p_original_filename text DEFAULT NULL,
  p_file_size bigint DEFAULT NULL,
  p_mime_type text DEFAULT NULL,
  -- Audio metadata
  p_title text DEFAULT NULL,
  p_artist text DEFAULT NULL,
  p_album text DEFAULT NULL,
  p_audio_duration_seconds int DEFAULT NULL,
  p_audio_thumbnail_url text DEFAULT NULL,
  p_track_number text DEFAULT NULL,
  p_release_year int DEFAULT NULL,
  p_genre text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_event_creator_id uuid;
  v_moments_enabled boolean;
  v_moments_who_can_post text;
  v_moments_require_approval boolean;
  v_moment_id uuid;
  v_status text;
  v_has_rsvp boolean;
  v_rsvp_status text;
BEGIN
  -- Determine user: use p_user_id if provided by a superadmin (God Mode), otherwise auth.uid()
  IF p_user_id IS NOT NULL THEN
    -- Verify caller is a superadmin
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'superadmin'
    ) THEN
      RAISE EXCEPTION 'Only superadmins can post on behalf of others';
    END IF;
    v_user_id := p_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get event creator
  SELECT created_by INTO v_event_creator_id
  FROM events
  WHERE id = p_event_id;

  IF v_event_creator_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Get moments settings from event_settings table (with defaults if not found)
  SELECT
    COALESCE(es.moments_enabled, true),
    COALESCE(es.moments_who_can_post, 'anyone'),
    COALESCE(es.moments_require_approval, false)
  INTO v_moments_enabled, v_moments_who_can_post, v_moments_require_approval
  FROM event_settings es
  WHERE es.event_id = p_event_id;

  -- If no settings exist, use defaults
  IF NOT FOUND THEN
    v_moments_enabled := true;
    v_moments_who_can_post := 'anyone';
    v_moments_require_approval := false;
  END IF;

  -- Check if moments are enabled
  IF NOT v_moments_enabled THEN
    RAISE EXCEPTION 'moments_disabled';
  END IF;

  -- Get user's RSVP status for this event
  SELECT status INTO v_rsvp_status
  FROM rsvps
  WHERE event_id = p_event_id AND user_id = v_user_id;

  v_has_rsvp := v_rsvp_status IS NOT NULL;

  -- Check posting permission
  IF v_moments_who_can_post = 'rsvp' THEN
    IF NOT v_has_rsvp AND v_event_creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  ELSIF v_moments_who_can_post = 'confirmed' THEN
    IF v_rsvp_status != 'going' AND v_event_creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  END IF;

  -- Determine initial status
  IF v_moments_require_approval AND v_event_creator_id != v_user_id THEN
    v_status := 'pending';
  ELSE
    v_status := 'published';
  END IF;

  -- Create the moment
  INSERT INTO moments (
    event_id, user_id, content_type, media_url, text_content, status,
    source_locale, thumbnail_url, cf_video_uid, cf_playback_url, video_status,
    youtube_url, youtube_video_id,
    file_url, original_filename, file_size, mime_type,
    title, artist, album, audio_duration_seconds, audio_thumbnail_url,
    track_number, release_year, genre
  )
  VALUES (
    p_event_id, v_user_id, p_content_type, p_media_url, p_text_content, v_status,
    p_source_locale, p_thumbnail_url, p_cf_video_uid, p_cf_playback_url, p_video_status,
    p_youtube_url, p_youtube_video_id,
    p_file_url, p_original_filename, p_file_size, p_mime_type,
    p_title, p_artist, p_album, p_audio_duration_seconds, p_audio_thumbnail_url,
    p_track_number, p_release_year, p_genre
  )
  RETURNING id INTO v_moment_id;

  RETURN jsonb_build_object(
    'moment_id', v_moment_id,
    'status', v_status
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_moment(
  uuid, text, text, text, uuid, text, text, text, text, text,
  text, text, text, text, bigint, text, text, text, text, int, text, text, int, text
) TO authenticated;

-- ============================================
-- STEP 5: Create storage bucket for materials
-- ============================================

-- Create bucket for moment materials (PDF, audio, documents)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'moment-materials',
  'moment-materials',
  true,
  104857600, -- 100MB limit
  ARRAY[
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/ogg',
    'audio/x-m4a',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for moment-materials bucket
CREATE POLICY "User can upload moment materials"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'moment-materials' AND
  public.can_upload_moment_media(name)
);

CREATE POLICY "User can update own moment materials"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'moment-materials' AND
  (storage.foldername(name))[2]::uuid = auth.uid()
)
WITH CHECK (
  bucket_id = 'moment-materials' AND
  (storage.foldername(name))[2]::uuid = auth.uid()
);

CREATE POLICY "User can delete own moment materials"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'moment-materials' AND
  (storage.foldername(name))[2]::uuid = auth.uid()
);

CREATE POLICY "Anyone can view moment materials"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'moment-materials');

-- ============================================
-- STEP 6: Add indexes for new columns
-- ============================================

CREATE INDEX IF NOT EXISTS idx_moments_content_type ON moments(content_type);
CREATE INDEX IF NOT EXISTS idx_moments_youtube ON moments(youtube_video_id) WHERE youtube_video_id IS NOT NULL;

-- ============================================
-- STEP 7: Refresh schema cache
-- ============================================

NOTIFY pgrst, 'reload schema';
