-- Venue Community Moments
-- Allows querying moments from events held at a specific venue
-- No schema changes to moments table - uses JOINs through events

-- RPC to get community moments from events at a venue
CREATE OR REPLACE FUNCTION get_venue_community_moments(
  p_venue_id uuid,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  user_id uuid,
  content_type text,
  media_url text,
  text_content text,
  created_at timestamptz,
  -- User info
  username text,
  display_name text,
  avatar_url text,
  -- Event info
  event_title text,
  event_slug text,
  event_image_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.event_id,
    m.user_id,
    m.content_type,
    m.media_url,
    m.text_content,
    m.created_at,
    p.username,
    p.display_name,
    p.avatar_url,
    e.title as event_title,
    e.slug as event_slug,
    e.image_url as event_image_url
  FROM moments m
  JOIN events e ON e.id = m.event_id
  JOIN profiles p ON p.id = m.user_id
  WHERE e.venue_id = p_venue_id
    AND m.status = 'published'
    AND e.status = 'published'
    AND e.starts_at < now()  -- Only past events
  ORDER BY m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Count function for pagination
CREATE OR REPLACE FUNCTION get_venue_community_moments_count(p_venue_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::int
  FROM moments m
  JOIN events e ON e.id = m.event_id
  WHERE e.venue_id = p_venue_id
    AND m.status = 'published'
    AND e.status = 'published'
    AND e.starts_at < now();
$$;

-- Ensure index exists for performance
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id) WHERE venue_id IS NOT NULL;
