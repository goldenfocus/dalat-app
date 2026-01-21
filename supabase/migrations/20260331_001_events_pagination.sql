-- Event pagination helpers for SEO-friendly paginated listing pages
-- Adds offset support and count function for upcoming events

-- Get upcoming events with pagination support
CREATE OR REPLACE FUNCTION get_upcoming_events_paginated(
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0
)
RETURNS SETOF events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM events
  WHERE status = 'published'
    AND starts_at > now()
  ORDER BY starts_at ASC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Get total count of upcoming events (for pagination)
CREATE OR REPLACE FUNCTION get_upcoming_events_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM events
  WHERE status = 'published'
    AND starts_at > now();
$$;

-- Grant access to both anonymous and authenticated users
GRANT EXECUTE ON FUNCTION get_upcoming_events_paginated(int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_upcoming_events_count() TO anon, authenticated;

COMMENT ON FUNCTION get_upcoming_events_paginated IS
'Returns upcoming events with pagination support.
Used for SEO-friendly paginated listing pages.';

COMMENT ON FUNCTION get_upcoming_events_count IS
'Returns total count of upcoming published events for pagination calculations.';
