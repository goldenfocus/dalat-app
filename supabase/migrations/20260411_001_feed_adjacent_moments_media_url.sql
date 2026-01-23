-- Migration: Add media_url to adjacent feed moments RPC
-- Description: Extends get_feed_adjacent_moments to return media URLs for preloading

-- Must drop first since we're changing the return type
DROP FUNCTION IF EXISTS get_feed_adjacent_moments(uuid, timestamptz, text[]);

CREATE OR REPLACE FUNCTION get_feed_adjacent_moments(
  p_current_id uuid,
  p_current_created_at timestamptz,
  p_content_types text[] DEFAULT ARRAY['photo', 'video']
)
RETURNS TABLE (
  prev_id uuid,
  prev_event_id uuid,
  prev_media_url text,
  next_id uuid,
  next_event_id uuid,
  next_media_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_id uuid;
  v_prev_event_id uuid;
  v_prev_media_url text;
  v_next_id uuid;
  v_next_event_id uuid;
  v_next_media_url text;
BEGIN
  -- Get previous moment (newer in feed, since feed is DESC by created_at)
  -- "Previous" means scrolling UP / going back in time within the feed
  SELECT m.id, m.event_id, m.media_url INTO v_prev_id, v_prev_event_id, v_prev_media_url
  FROM moments m
  JOIN events e ON e.id = m.event_id
  WHERE m.status = 'published'
    AND m.content_type::text = ANY(p_content_types)
    AND e.status = 'published'
    AND e.starts_at < now()
    AND (
      m.created_at > p_current_created_at
      OR (m.created_at = p_current_created_at AND m.id > p_current_id)
    )
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT 1;

  -- Get next moment (older in feed, since feed is DESC by created_at)
  -- "Next" means scrolling DOWN / continuing through the feed
  SELECT m.id, m.event_id, m.media_url INTO v_next_id, v_next_event_id, v_next_media_url
  FROM moments m
  JOIN events e ON e.id = m.event_id
  WHERE m.status = 'published'
    AND m.content_type::text = ANY(p_content_types)
    AND e.status = 'published'
    AND e.starts_at < now()
    AND (
      m.created_at < p_current_created_at
      OR (m.created_at = p_current_created_at AND m.id < p_current_id)
    )
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  RETURN QUERY SELECT v_prev_id, v_prev_event_id, v_prev_media_url, v_next_id, v_next_event_id, v_next_media_url;
END;
$$;

-- Re-grant execute permissions after recreating the function
GRANT EXECUTE ON FUNCTION get_feed_adjacent_moments(uuid, timestamptz, text[]) TO anon, authenticated;

COMMENT ON FUNCTION get_feed_adjacent_moments IS 'Finds the previous and next moments in the global feed ordering. Returns media URLs for client-side preloading to enable instant navigation.';
