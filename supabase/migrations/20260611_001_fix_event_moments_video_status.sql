-- Migration: Fix get_event_moments to filter processing videos
-- Description: Videos with video_status != 'ready' should not appear in event moments listings
-- This prevents 404-like behavior when viewing a moment detail page for a video still encoding

-- Drop and recreate the function with the video_status filter
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
  avatar_url text
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
    p.avatar_url
  FROM moments m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.event_id = p_event_id
    AND m.status = 'published'
    -- Only show videos that are ready (or photos which default to 'ready')
    AND m.video_status = 'ready'
  ORDER BY m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION get_event_moments(uuid, int, int) TO anon, authenticated;

COMMENT ON FUNCTION get_event_moments IS 'Fetches published moments for an event, filtering out videos still encoding (video_status != ready).';
