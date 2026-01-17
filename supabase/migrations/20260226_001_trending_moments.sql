-- Migration: Trending moments RPC
-- Description: Creates RPC function to fetch trending moments with algorithm weights
-- Weights: recency (7-day boost), like count, event attendance

CREATE OR REPLACE FUNCTION get_trending_moments(
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  user_id uuid,
  content_type text,
  media_url text,
  text_content text,
  created_at timestamptz,
  username text,
  display_name text,
  avatar_url text,
  event_slug text,
  event_title text,
  event_image_url text,
  event_starts_at timestamptz,
  event_location_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH moment_scores AS (
    SELECT
      m.id,
      m.event_id,
      m.user_id,
      m.content_type::text,
      m.media_url,
      m.text_content,
      m.created_at,
      p.username,
      p.display_name,
      p.avatar_url,
      e.slug as event_slug,
      e.title as event_title,
      e.image_url as event_image_url,
      e.starts_at as event_starts_at,
      e.location_name as event_location_name,
      -- Trending score calculation
      (
        -- Like count weight (2x multiplier)
        COALESCE((SELECT count(*) FROM moment_likes ml WHERE ml.moment_id = m.id), 0) * 2
        -- Recency boost: +10 if within last 7 days
        + CASE WHEN m.created_at > now() - interval '7 days' THEN 10 ELSE 0 END
        -- Event attendance weight (number of RSVPs)
        + COALESCE((SELECT count(*) FROM rsvps r WHERE r.event_id = m.event_id AND r.status = 'going'), 0)
      ) as trending_score
    FROM moments m
    JOIN profiles p ON p.id = m.user_id
    JOIN events e ON e.id = m.event_id
    WHERE m.status = 'published'
      AND m.content_type IN ('photo', 'video')
      AND e.status = 'published'
      AND e.starts_at < now()  -- Only past events
      AND m.created_at > now() - interval '30 days'  -- Last 30 days only
  )
  SELECT
    id,
    event_id,
    user_id,
    content_type,
    media_url,
    text_content,
    created_at,
    username,
    display_name,
    avatar_url,
    event_slug,
    event_title,
    event_image_url,
    event_starts_at,
    event_location_name
  FROM moment_scores
  ORDER BY trending_score DESC, created_at DESC
  LIMIT p_limit;
$$;

-- Grant execute to authenticated and anon users
GRANT EXECUTE ON FUNCTION get_trending_moments(int) TO anon, authenticated;

COMMENT ON FUNCTION get_trending_moments IS 'Fetches trending moments from the last 30 days, ranked by: like count (2x weight), recency boost (7-day window), and event attendance.';
