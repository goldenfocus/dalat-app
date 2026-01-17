-- Get published moments counts for multiple events efficiently
-- Used by archive pages to enable "sort by most content" feature

CREATE OR REPLACE FUNCTION get_events_moments_counts(p_event_ids uuid[])
RETURNS TABLE (
  event_id uuid,
  moments_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS event_id,
    COALESCE(m.cnt, 0) AS moments_count
  FROM unnest(p_event_ids) AS e(id)
  LEFT JOIN (
    SELECT event_id, COUNT(*) AS cnt
    FROM moments
    WHERE status = 'published'
    AND event_id = ANY(p_event_ids)
    GROUP BY event_id
  ) m ON m.event_id = e.id;
$$;

GRANT EXECUTE ON FUNCTION get_events_moments_counts(uuid[]) TO anon, authenticated;

COMMENT ON FUNCTION get_events_moments_counts IS
'Returns published moments count for each event ID in the input array.
Used by archive pages to enable sorting by content richness.';


-- Get events the current user attended (RSVP status = going)
-- Used for "Events I attended" filter in archive
CREATE OR REPLACE FUNCTION get_user_attended_event_ids(p_event_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY_AGG(r.event_id)
  FROM rsvps r
  WHERE r.event_id = ANY(p_event_ids)
    AND r.user_id = auth.uid()
    AND r.status = 'going';
$$;

GRANT EXECUTE ON FUNCTION get_user_attended_event_ids(uuid[]) TO authenticated;

COMMENT ON FUNCTION get_user_attended_event_ids IS
'Returns event IDs from the input array where the current user had a "going" RSVP.
Used for "Events I attended" filter in archive pages.';
