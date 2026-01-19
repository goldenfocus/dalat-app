-- Migration: Adjacent feed moments RPC
-- Description: Creates RPC function to find previous/next moments in the global feed ordering
-- This enables "continuous discovery" navigation across all events

-- RPC function to get adjacent moments in the global feed
CREATE OR REPLACE FUNCTION get_feed_adjacent_moments(
  p_current_id uuid,
  p_current_created_at timestamptz,
  p_content_types text[] DEFAULT ARRAY['photo', 'video']
)
RETURNS TABLE (
  prev_id uuid,
  prev_event_id uuid,
  next_id uuid,
  next_event_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_id uuid;
  v_prev_event_id uuid;
  v_next_id uuid;
  v_next_event_id uuid;
BEGIN
  -- Get previous moment (newer in feed, since feed is DESC by created_at)
  -- "Previous" means scrolling UP / going back in time within the feed
  SELECT m.id, m.event_id INTO v_prev_id, v_prev_event_id
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
  SELECT m.id, m.event_id INTO v_next_id, v_next_event_id
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

  RETURN QUERY SELECT v_prev_id, v_prev_event_id, v_next_id, v_next_event_id;
END;
$$;

-- Grant execute to authenticated and anon users
GRANT EXECUTE ON FUNCTION get_feed_adjacent_moments(uuid, timestamptz, text[]) TO anon, authenticated;

COMMENT ON FUNCTION get_feed_adjacent_moments IS 'Finds the previous and next moments in the global feed ordering. Used for continuous discovery navigation across all events. Also returns event IDs to enable visual transitions when crossing event boundaries.';
