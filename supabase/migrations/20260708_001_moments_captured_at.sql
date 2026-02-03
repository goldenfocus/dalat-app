-- ============================================
-- Add captured_at column for chronological sorting
--
-- Problem: Moments are sorted by upload time (created_at), not
-- capture time. Bulk uploads appear scattered because they all
-- have the same upload timestamp.
--
-- Solution: Add captured_at column to store actual capture time
-- from EXIF/video metadata, sort by that instead.
-- ============================================

-- Add captured_at column to moments table
ALTER TABLE moments
ADD COLUMN IF NOT EXISTS captured_at timestamptz;

-- Create index for efficient sorting by capture time
CREATE INDEX IF NOT EXISTS idx_moments_captured_at ON moments(captured_at DESC NULLS LAST);

-- Comment
COMMENT ON COLUMN moments.captured_at IS 'Actual capture time from EXIF/video metadata. Falls back to created_at for sorting.';

-- ============================================
-- Update get_event_moments to sort by captured_at
-- ============================================

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
  captured_at timestamptz,
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
    m.captured_at,
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
    AND (
      m.content_type NOT IN ('video')
      OR m.video_status = 'ready'
    )
  -- Sort by captured_at (actual recording time), fall back to created_at
  ORDER BY COALESCE(m.captured_at, m.created_at) DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION get_event_moments(uuid, int, int) TO anon, authenticated;

COMMENT ON FUNCTION get_event_moments IS 'Fetches published moments for an event, sorted by capture time (actual recording time) with fallback to upload time.';

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
