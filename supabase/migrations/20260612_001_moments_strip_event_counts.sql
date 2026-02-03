-- ============================================
-- Add event photo/video counts to homepage moments strip
-- Shows: event name, relative time, 📷3 🎬2
-- ============================================

-- Drop existing function first (return type is changing)
DROP FUNCTION IF EXISTS get_homepage_moments_strip(uuid, int);

CREATE OR REPLACE FUNCTION get_homepage_moments_strip(
  p_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  media_url text,
  thumbnail_url text,
  content_type text,
  event_slug text,
  event_title text,
  event_image_url text,
  user_avatar_url text,
  username text,
  display_name text,
  created_at timestamptz,
  quality_score float,
  event_photo_count int,
  event_video_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Wrap in subquery to re-sort chronologically (latest first)
  SELECT * FROM (
    SELECT DISTINCT ON (m.event_id)
      m.id,
      m.media_url,
      m.thumbnail_url,
      m.content_type,
      e.slug as event_slug,
      e.title as event_title,
      e.image_url as event_image_url,
      p.avatar_url as user_avatar_url,
      p.username,
      p.display_name,
      m.created_at,
      COALESCE(mm.quality_score, 0.5) as quality_score,
      -- Count photos and videos for this event
      (SELECT count(*)::int FROM moments
       WHERE event_id = m.event_id
       AND status = 'published'
       AND content_type = 'photo') as event_photo_count,
      (SELECT count(*)::int FROM moments
       WHERE event_id = m.event_id
       AND status = 'published'
       AND content_type = 'video') as event_video_count
    FROM moments m
    JOIN events e ON e.id = m.event_id
    JOIN profiles p ON p.id = m.user_id
    LEFT JOIN moment_metadata mm ON mm.moment_id = m.id
    LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = p_user_id
    WHERE m.status = 'published'
      AND m.content_type IN ('photo', 'video', 'image')
      AND (m.media_url IS NOT NULL OR m.thumbnail_url IS NOT NULL)
      AND e.status = 'published'
      AND e.starts_at < now() -- Past events only
    ORDER BY
      m.event_id,
      -- Pick best moment per event: user attended first, then quality
      CASE WHEN r.user_id IS NOT NULL AND r.status = 'going' THEN 0 ELSE 1 END,
      COALESCE(mm.quality_score, 0.5) DESC,
      m.created_at DESC
  ) sub
  ORDER BY created_at DESC -- Latest moments first (leftmost)
  LIMIT p_limit;
$$;
