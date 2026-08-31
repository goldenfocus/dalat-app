-- Count a recurring series as one discovery choice on the all-upcoming page.
-- Calendar and series-detail views continue to expose every occurrence.

CREATE OR REPLACE FUNCTION get_upcoming_event_choices_paginated(
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0
)
RETURNS SETOF events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH representative_events AS (
    SELECT DISTINCT ON (COALESCE(candidate.series_id, candidate.id))
      candidate.id,
      candidate.starts_at
    FROM events AS candidate
    WHERE candidate.status = 'published'
      AND candidate.starts_at > now()
    ORDER BY
      COALESCE(candidate.series_id, candidate.id),
      candidate.starts_at ASC,
      candidate.id ASC
  )
  SELECT event.*
  FROM representative_events AS representative
  JOIN events AS event ON event.id = representative.id
  ORDER BY representative.starts_at ASC, event.id ASC
  LIMIT GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION get_upcoming_event_choices_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT COALESCE(event.series_id, event.id))::integer
  FROM events AS event
  WHERE event.status = 'published'
    AND event.starts_at > now();
$$;

GRANT EXECUTE ON FUNCTION get_upcoming_event_choices_paginated(int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_upcoming_event_choices_count() TO anon, authenticated;

COMMENT ON FUNCTION get_upcoming_event_choices_paginated IS
'Returns one upcoming representative per recurring series plus every standalone event, then paginates those distinct choices.';

COMMENT ON FUNCTION get_upcoming_event_choices_count IS
'Returns the number of distinct upcoming choices, counting each recurring series once.';
