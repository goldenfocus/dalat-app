-- ============================================
-- Fix video count in homepage moments strip
--
-- The event_video_count was counting ALL published videos regardless
-- of video_status. But get_event_moments only shows videos where
-- video_status = 'ready'. This caused a mismatch: the strip badge
-- showed e.g. "7 videos" but clicking through showed 0.
--
-- Fix: Only count videos with video_status = 'ready'.
-- ============================================

CREATE OR REPLACE FUNCTION get_homepage_moments_strip(
  p_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 12,
  p_sort text DEFAULT 'event_date'
)
RETURNS TABLE (
  id uuid,
  media_url text,
  thumbnail_url text,
  content_type text,
  event_slug text,
  event_title text,
  event_image_url text,
  event_starts_at timestamptz,
  user_avatar_url text,
  username text,
  display_name text,
  created_at timestamptz,
  quality_score float,
  event_photo_count int,
  event_video_count int,
  event_audio_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM (
    SELECT DISTINCT ON (m.event_id)
      m.id,
      m.media_url,
      m.thumbnail_url,
      m.content_type,
      e.slug as event_slug,
      e.title as event_title,
      e.image_url as event_image_url,
      e.starts_at as event_starts_at,
      p.avatar_url as user_avatar_url,
      p.username,
      p.display_name,
      m.created_at,
      COALESCE(mm.quality_score, 0.5) as quality_score,
      (SELECT count(*)::int FROM moments
       WHERE event_id = m.event_id
       AND status = 'published'
       AND content_type = 'photo') as event_photo_count,
      (SELECT count(*)::int FROM moments
       WHERE event_id = m.event_id
       AND status = 'published'
       AND content_type = 'video'
       AND video_status = 'ready') as event_video_count,
      (SELECT count(*)::int FROM playlist_tracks pt
       JOIN event_playlists ep ON ep.id = pt.playlist_id
       WHERE ep.event_id = m.event_id) as event_audio_count
    FROM moments m
    JOIN events e ON e.id = m.event_id
    JOIN profiles p ON p.id = m.user_id
    LEFT JOIN moment_metadata mm ON mm.moment_id = m.id
    LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = p_user_id
    WHERE m.status = 'published'
      AND m.content_type IN ('photo', 'video', 'image')
      AND (m.media_url IS NOT NULL OR m.thumbnail_url IS NOT NULL)
      AND e.status = 'published'
      AND e.starts_at < now()
    ORDER BY
      m.event_id,
      -- 1. PREFER MANUALLY SELECTED COVER MOMENT (DO NOT REMOVE THIS!)
      CASE WHEN e.cover_moment_id = m.id THEN 0 ELSE 1 END,
      -- 2. Then events user attended
      CASE WHEN r.user_id IS NOT NULL AND r.status = 'going' THEN 0 ELSE 1 END,
      -- 3. Then by quality score
      COALESCE(mm.quality_score, 0.5) DESC,
      m.created_at DESC
  ) sub
  ORDER BY
    CASE
      WHEN p_sort = 'recent' THEN NULL
      ELSE event_starts_at  -- 'event_date' or default
    END DESC NULLS LAST,
    CASE
      WHEN p_sort = 'recent' THEN created_at
      ELSE NULL
    END DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_homepage_moments_strip(uuid, int, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
