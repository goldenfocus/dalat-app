-- Search events RPC function
-- Enables keyword search across event title, description, and location

CREATE OR REPLACE FUNCTION search_events(
  p_query text,
  p_lifecycle text DEFAULT 'upcoming',
  p_limit int DEFAULT 20
)
RETURNS SETOF events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.*
  FROM events e
  WHERE e.status = 'published'
    AND (
      p_query IS NULL
      OR p_query = ''
      OR e.title ILIKE '%' || p_query || '%'
      OR e.description ILIKE '%' || p_query || '%'
      OR e.location_name ILIKE '%' || p_query || '%'
    )
    AND (
      CASE p_lifecycle
        WHEN 'upcoming' THEN e.starts_at > now()
        WHEN 'happening' THEN e.starts_at <= now() AND e.ends_at > now()
        WHEN 'past' THEN e.ends_at <= now()
        ELSE true
      END
    )
  ORDER BY
    CASE p_lifecycle
      WHEN 'past' THEN e.starts_at
      ELSE e.starts_at
    END ASC
  LIMIT p_limit;
$$;

-- Grant execute to authenticated and anon users
GRANT EXECUTE ON FUNCTION search_events(text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION search_events(text, text, int) TO anon;

COMMENT ON FUNCTION search_events IS 'Search published events by keyword across title, description, and location. Supports lifecycle filtering (upcoming, happening, past).';
