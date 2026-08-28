-- Fix: Restore missing CF Stream fields in get_feed_moments_grouped
-- The 20260621 migration accidentally dropped thumbnail_url, cf_video_uid,
-- cf_playback_url, video_status from the JSONB output when adding has_playlist.
-- This caused video moments to show as gray squares (no thumbnail) and
-- black screens in lightbox (no playback URL).

DROP FUNCTION IF EXISTS get_feed_moments_grouped(int, int, int, text[]);
CREATE OR REPLACE FUNCTION get_feed_moments_grouped(
  p_event_limit int DEFAULT 10,
  p_moments_per_event int DEFAULT 6,
  p_event_offset int DEFAULT 0,
  p_content_types text[] DEFAULT ARRAY['photo', 'video']
)
RETURNS TABLE (
  event_id uuid,
  event_slug text,
  event_title text,
  event_starts_at timestamptz,
  event_image_url text,
  event_location_name text,
  total_moment_count bigint,
  has_playlist boolean,
  moments jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH feed_moments AS (
    -- Get all published moments from past events with user info
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
      m.text_content,
      m.created_at,
      p.username,
      p.display_name,
      p.avatar_url,
      e.slug as event_slug,
      e.title as event_title,
      e.starts_at as event_starts_at,
      e.image_url as event_image_url,
      e.location_name as event_location_name,
      -- Rank moments within each event by created_at (newest first)
      ROW_NUMBER() OVER (PARTITION BY m.event_id ORDER BY m.created_at DESC) as moment_rank
    FROM moments m
    JOIN profiles p ON p.id = m.user_id
    JOIN events e ON e.id = m.event_id
    WHERE m.status = 'published'
      AND m.content_type::text = ANY(p_content_types)
      AND e.status = 'published'
      AND e.starts_at < now()  -- Only past events
      AND m.video_status = 'ready'  -- Only show videos that finished encoding
  ),
  event_stats AS (
    -- Get total moment count per event (for "View X more" indicator)
    SELECT
      event_id,
      COUNT(*) as total_count
    FROM feed_moments
    GROUP BY event_id
  ),
  events_with_moments AS (
    -- Get distinct events ordered by most recent moment
    SELECT DISTINCT ON (fm.event_id)
      fm.event_id,
      fm.event_slug,
      fm.event_title,
      fm.event_starts_at,
      fm.event_image_url,
      fm.event_location_name,
      fm.created_at as latest_moment_at,
      es.total_count
    FROM feed_moments fm
    JOIN event_stats es ON es.event_id = fm.event_id
    ORDER BY fm.event_id, fm.created_at DESC
  ),
  paginated_events AS (
    -- Paginate events by most recent moment
    SELECT *
    FROM events_with_moments
    ORDER BY latest_moment_at DESC
    LIMIT p_event_limit
    OFFSET p_event_offset
  ),
  event_playlists_check AS (
    -- Check which events have playlists with tracks
    SELECT DISTINCT ep.event_id
    FROM event_playlists ep
    JOIN playlist_tracks pt ON pt.playlist_id = ep.id
    WHERE ep.event_id IN (SELECT event_id FROM paginated_events)
  )
  SELECT
    pe.event_id,
    pe.event_slug,
    pe.event_title,
    pe.event_starts_at,
    pe.event_image_url,
    pe.event_location_name,
    pe.total_count as total_moment_count,
    (epc.event_id IS NOT NULL) as has_playlist,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', fm.id,
          'user_id', fm.user_id,
          'username', fm.username,
          'display_name', fm.display_name,
          'avatar_url', fm.avatar_url,
          'content_type', fm.content_type,
          'media_url', fm.media_url,
          'thumbnail_url', fm.thumbnail_url,
          'cf_video_uid', fm.cf_video_uid,
          'cf_playback_url', fm.cf_playback_url,
          'video_status', fm.video_status,
          'text_content', fm.text_content,
          'created_at', fm.created_at
        )
        ORDER BY fm.created_at DESC
      )
      FROM feed_moments fm
      WHERE fm.event_id = pe.event_id
        AND fm.moment_rank <= p_moments_per_event
    ) as moments
  FROM paginated_events pe
  LEFT JOIN event_playlists_check epc ON epc.event_id = pe.event_id
  ORDER BY pe.latest_moment_at DESC;
$$;
GRANT EXECUTE ON FUNCTION get_feed_moments_grouped(int, int, int, text[]) TO anon, authenticated;
COMMENT ON FUNCTION get_feed_moments_grouped IS 'Fetches moments from past events grouped by event for the discovery feed. Orders events by most recent moment activity. Includes has_playlist flag and CF Stream video fields. Used for desktop discovery view.';
