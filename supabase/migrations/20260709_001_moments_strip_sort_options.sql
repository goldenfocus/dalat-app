-- ============================================
-- Add sort parameter to homepage moments strip
--
-- Options:
-- - 'event_date' (default): Sort by when the event happened (starts_at)
-- - 'recent': Sort by most recent upload (created_at) - previous behavior
-- ============================================

DROP FUNCTION IF EXISTS get_homepage_moments_strip(uuid, int);
DROP FUNCTION IF EXISTS get_homepage_moments_strip(uuid, int, text);

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
       AND content_type = 'video') as event_video_count,
      (SELECT count(*)::int FROM moments
       WHERE event_id = m.event_id
       AND status = 'published'
       AND content_type = 'audio') as event_audio_count
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
      CASE WHEN e.cover_moment_id = m.id THEN 0 ELSE 1 END,
      CASE WHEN r.user_id IS NOT NULL AND r.status = 'going' THEN 0 ELSE 1 END,
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

COMMENT ON FUNCTION get_homepage_moments_strip IS 'Fetches moments for homepage strip with sort options: event_date (default) or recent';

NOTIFY pgrst, 'reload schema';
