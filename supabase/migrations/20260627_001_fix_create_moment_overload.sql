-- ============================================
-- Fix: create_moment function overloading conflict
--
-- Problem: Two versions of create_moment exist:
-- 1. 11-param version (with file_hash from 20260620)
-- 2. 24-param version (with youtube/materials from 20260614)
--
-- PostgREST can't choose between them (PGRST203 error).
-- Solution: Drop ALL versions and create ONE unified function.
-- ============================================

-- Drop ALL existing create_moment function signatures
DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text, uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text, uuid, text, text, text, text, text, text, text, text, text, bigint, text, text, text, text, int, text, text, int, text);
DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text);

-- Create unified function with ALL fields
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
  p_genre text DEFAULT NULL,
  -- Duplicate detection
  p_file_hash text DEFAULT NULL
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

  -- Create the moment with ALL fields
  INSERT INTO moments (
    event_id, user_id, content_type, media_url, text_content, status,
    source_locale, thumbnail_url, cf_video_uid, cf_playback_url, video_status,
    youtube_url, youtube_video_id,
    file_url, original_filename, file_size, mime_type,
    title, artist, album, audio_duration_seconds, audio_thumbnail_url,
    track_number, release_year, genre,
    file_hash
  )
  VALUES (
    p_event_id, v_user_id, p_content_type, p_media_url, p_text_content, v_status,
    p_source_locale, p_thumbnail_url, p_cf_video_uid, p_cf_playback_url, p_video_status,
    p_youtube_url, p_youtube_video_id,
    p_file_url, p_original_filename, p_file_size, p_mime_type,
    p_title, p_artist, p_album, p_audio_duration_seconds, p_audio_thumbnail_url,
    p_track_number, p_release_year, p_genre,
    p_file_hash
  )
  RETURNING id INTO v_moment_id;

  RETURN jsonb_build_object(
    'moment_id', v_moment_id,
    'status', v_status
  );
END;
$$;

-- Grant execute permission (with full signature)
GRANT EXECUTE ON FUNCTION create_moment(
  uuid, text, text, text, uuid, text, text, text, text, text,
  text, text, text, text, bigint, text, text, text, text, int, text, text, int, text, text
) TO authenticated;

-- Refresh schema cache so PostgREST picks up the changes
NOTIFY pgrst, 'reload schema';
