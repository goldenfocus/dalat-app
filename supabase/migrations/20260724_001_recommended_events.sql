-- ============================================
-- Recommended Events ("For You" Personalization)
-- ============================================

-- Computes event recommendations based on:
-- 1. Tag affinity from RSVP history (events user went to / showed interest in)
-- 2. Event popularity (RSVP count)
-- 3. Recency (newer events score higher)
-- 4. Sponsor tier boost
-- Falls back to popular upcoming events if no RSVP history.
CREATE OR REPLACE FUNCTION get_recommended_events(p_user_id uuid, p_limit int DEFAULT 6)
RETURNS SETOF events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_tags text[];
  v_rsvp_count int;
BEGIN
  -- Gather user's preferred tags from their RSVP history
  SELECT array_agg(DISTINCT tag), count(DISTINCT r.event_id)
  INTO v_user_tags, v_rsvp_count
  FROM rsvps r
  JOIN events e ON e.id = r.event_id
  CROSS JOIN LATERAL unnest(COALESCE(e.ai_tags, '{}')) AS tag
  WHERE r.user_id = p_user_id
    AND r.status IN ('going', 'interested');

  -- If user has no RSVP history, return popular upcoming events
  IF v_rsvp_count IS NULL OR v_rsvp_count = 0 THEN
    RETURN QUERY
    SELECT e.*
    FROM events e
    WHERE e.status = 'published'
      AND e.starts_at > now()
    ORDER BY
      COALESCE(e.sponsor_tier, 0) DESC,
      (SELECT count(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') DESC,
      e.starts_at ASC
    LIMIT p_limit;
    RETURN;
  END IF;

  -- Score upcoming events by tag overlap + popularity + recency + sponsor tier
  RETURN QUERY
  SELECT e.*
  FROM events e
  WHERE e.status = 'published'
    AND e.starts_at > now()
    -- Exclude events user already RSVP'd to
    AND NOT EXISTS (
      SELECT 1 FROM rsvps r
      WHERE r.event_id = e.id AND r.user_id = p_user_id AND r.status != 'cancelled'
    )
  ORDER BY
    -- Tag overlap score (0-1 range, weighted heavily)
    (
      SELECT count(*)::float / GREATEST(array_length(v_user_tags, 1), 1)
      FROM unnest(COALESCE(e.ai_tags, '{}')) AS t
      WHERE t = ANY(v_user_tags)
    ) * 5.0
    -- Popularity score (log scale)
    + ln(1 + (SELECT count(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going'))
    -- Sponsor tier boost
    + COALESCE(e.sponsor_tier, 0) * 2.0
    -- Recency: slight preference for sooner events
    - EXTRACT(EPOCH FROM (e.starts_at - now())) / 86400.0 * 0.01
    DESC
  LIMIT p_limit;
END;
$$;
