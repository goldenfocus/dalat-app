-- ============================================
-- Add saved timing offset to playlist_tracks
-- ============================================
--
-- Allows admins to save the optimal timing offset per song.
-- Users start with this baseline but can still temp-adjust.
--

-- Add timing_offset column (milliseconds, default 0)
ALTER TABLE playlist_tracks
ADD COLUMN IF NOT EXISTS timing_offset integer DEFAULT 0;

COMMENT ON COLUMN playlist_tracks.timing_offset IS 'Saved timing offset in milliseconds (negative = lyrics appear early). Admin-adjustable baseline.';

-- ============================================
-- RPC to update timing offset (admin only)
-- ============================================

CREATE OR REPLACE FUNCTION update_track_timing_offset(
  p_track_id uuid,
  p_timing_offset integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user is admin
  SELECT is_admin INTO v_is_admin
  FROM profiles
  WHERE id = v_user_id;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Update timing offset
  UPDATE playlist_tracks
  SET timing_offset = p_timing_offset
  WHERE id = p_track_id;

  RETURN true;
END;
$$;

-- ============================================
-- Update get_event_playlist to include timing
-- ============================================

DROP FUNCTION IF EXISTS get_event_playlist(text);

CREATE OR REPLACE FUNCTION get_event_playlist(p_event_slug text)
RETURNS TABLE (
  playlist_id uuid,
  playlist_title text,
  playlist_description text,
  event_id uuid,
  event_title text,
  event_image_url text,
  event_starts_at timestamptz,
  event_location_name text,
  track_id uuid,
  track_file_url text,
  track_title text,
  track_artist text,
  track_album text,
  track_thumbnail_url text,
  track_duration_seconds integer,
  track_sort_order integer,
  track_lyrics_lrc text,
  track_seo_keywords jsonb,
  track_timing_offset integer  -- NEW: saved timing offset
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ep.id AS playlist_id,
    ep.title AS playlist_title,
    ep.description AS playlist_description,
    e.id AS event_id,
    e.title AS event_title,
    e.image_url AS event_image_url,
    e.starts_at AS event_starts_at,
    e.location_name AS event_location_name,
    pt.id AS track_id,
    pt.file_url AS track_file_url,
    pt.title AS track_title,
    pt.artist AS track_artist,
    pt.album AS track_album,
    pt.thumbnail_url AS track_thumbnail_url,
    pt.duration_seconds AS track_duration_seconds,
    pt.sort_order AS track_sort_order,
    pt.lyrics_lrc AS track_lyrics_lrc,
    pt.seo_keywords AS track_seo_keywords,
    COALESCE(pt.timing_offset, 0) AS track_timing_offset
  FROM events e
  JOIN event_playlists ep ON ep.event_id = e.id
  LEFT JOIN playlist_tracks pt ON pt.playlist_id = ep.id
  WHERE e.slug = p_event_slug
  AND e.status = 'published'
  ORDER BY pt.sort_order ASC, pt.created_at ASC;
$$;
