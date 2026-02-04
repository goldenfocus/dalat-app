-- ============================================
-- Add lyrics_lrc to playlist_tracks for karaoke
-- ============================================
--
-- Extends the playlist_tracks table to support karaoke lyrics display.
-- This complements the earlier migration that added lyrics_lrc to event_materials.
--

-- Add lyrics_lrc column to playlist_tracks
ALTER TABLE playlist_tracks
ADD COLUMN IF NOT EXISTS lyrics_lrc text;

COMMENT ON COLUMN playlist_tracks.lyrics_lrc IS 'LRC-formatted lyrics with timestamps for karaoke display';

-- ============================================
-- Update get_event_playlist RPC to return lyrics
-- ============================================

-- Must drop first because we're changing the return type
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
  track_lyrics_lrc text  -- NEW: LRC lyrics for karaoke
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
    pt.lyrics_lrc AS track_lyrics_lrc  -- NEW
  FROM events e
  JOIN event_playlists ep ON ep.event_id = e.id
  LEFT JOIN playlist_tracks pt ON pt.playlist_id = ep.id
  WHERE e.slug = p_event_slug
  AND e.status = 'published'
  ORDER BY pt.sort_order ASC, pt.created_at ASC;
$$;
