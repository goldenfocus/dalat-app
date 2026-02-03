-- Fix get_event_moments to include YouTube and material content types
-- YouTube moments were being filtered out by video_status = 'ready' condition

DROP FUNCTION IF EXISTS get_event_moments(uuid, int, int);

CREATE OR REPLACE FUNCTION get_event_moments(
  p_event_id uuid,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  user_id uuid,
  content_type text,
  media_url text,
  thumbnail_url text,
  cf_video_uid text,
  cf_playback_url text,
  video_status text,
  video_duration_seconds numeric,
  text_content text,
  created_at timestamptz,
  username text,
  display_name text,
  avatar_url text,
  -- YouTube fields
  youtube_url text,
  youtube_video_id text,
  -- Material/file fields
  file_url text,
  original_filename text,
  file_size bigint,
  mime_type text,
  -- Audio metadata
  title text,
  artist text,
  album text,
  audio_duration_seconds int,
  audio_thumbnail_url text,
  track_number text,
  release_year int,
  genre text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.event_id,
    m.user_id,
    m.content_type,
    m.media_url,
    m.thumbnail_url,
    m.cf_video_uid,
    m.cf_playback_url,
    m.video_status,
    m.video_duration_seconds,
    m.text_content,
    m.created_at,
    p.username,
    p.display_name,
    p.avatar_url,
    -- YouTube fields
    m.youtube_url,
    m.youtube_video_id,
    -- Material/file fields
    m.file_url,
    m.original_filename,
    m.file_size,
    m.mime_type,
    -- Audio metadata
    m.title,
    m.artist,
    m.album,
    m.audio_duration_seconds,
    m.audio_thumbnail_url,
    m.track_number,
    m.release_year,
    m.genre
  FROM moments m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.event_id = p_event_id
    AND m.status = 'published'
    -- Only filter video_status for actual video content
    -- YouTube, PDF, audio, text, etc. don't need video encoding
    AND (
      m.content_type NOT IN ('video')
      OR m.video_status = 'ready'
    )
  ORDER BY m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION get_event_moments(uuid, int, int) TO anon, authenticated;

COMMENT ON FUNCTION get_event_moments IS 'Fetches published moments for an event, including YouTube and material types. Videos are filtered by video_status = ready.';

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
