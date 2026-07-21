-- ============================================
-- Moments read in story order (chronological ASC)
--
-- Problem: get_event_moments sorted DESC, so an event gallery played
-- backwards -- you saw the end of the ride before the start. Combined
-- with upload-order fallback (captured_at is NULL on all rows today),
-- multi-camera events read as random.
--
-- Solution: sort ASC so galleries read as a story. m.id is added as a
-- tiebreaker so LIMIT/OFFSET pagination stays stable when two moments
-- share a timestamp (common in bulk uploads).
--
-- NOTE: body below is verbatim pg_get_functiondef() from prod with ONLY
-- the ORDER BY changed. Do not rewrite from scratch -- this function
-- returns 30 columns and has lost fields to rewrites before.
-- ============================================

CREATE OR REPLACE FUNCTION public.get_event_moments(p_event_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, event_id uuid, user_id uuid, content_type text, media_url text, thumbnail_url text, cf_video_uid text, cf_playback_url text, video_status text, video_duration_seconds numeric, text_content text, created_at timestamp with time zone, captured_at timestamp with time zone, username text, display_name text, avatar_url text, youtube_url text, youtube_video_id text, file_url text, original_filename text, file_size bigint, mime_type text, title text, artist text, album text, audio_duration_seconds integer, audio_thumbnail_url text, track_number text, release_year integer, genre text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ORDER BY COALESCE(m.captured_at, m.created_at) ASC, m.id ASC
  LIMIT p_limit
  OFFSET p_offset;
$function$;

GRANT EXECUTE ON FUNCTION get_event_moments(uuid, int, int) TO anon, authenticated;

COMMENT ON FUNCTION get_event_moments IS 'Fetches published moments for an event in chronological (story) order: capture time when known, upload time otherwise.';

-- Index matching the new sort expression (event gallery is the hottest read)
CREATE INDEX IF NOT EXISTS idx_moments_event_chrono
  ON moments (event_id, (COALESCE(captured_at, created_at)), id);

NOTIFY pgrst, 'reload schema';
