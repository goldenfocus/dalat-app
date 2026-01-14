-- Time-based event archive queries
-- Supports SEO-friendly URLs like /events/2026/january

-- Get events for a specific month (in Da Lat timezone)
CREATE OR REPLACE FUNCTION get_events_by_month(
  p_year int,
  p_month int,  -- 1-12
  p_limit int DEFAULT 50
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
  AND EXTRACT(YEAR FROM starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = p_year
  AND EXTRACT(MONTH FROM starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = p_month
  ORDER BY starts_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_events_by_month(int, int, int) TO anon, authenticated;

COMMENT ON FUNCTION get_events_by_month IS
'Returns published events for a specific year/month in Da Lat timezone.
Used for archive pages like /events/2026/january';


-- Get list of months that have published events (for sitemap and navigation)
CREATE OR REPLACE FUNCTION get_months_with_events()
RETURNS TABLE(year int, month int, event_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(YEAR FROM starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS year,
    EXTRACT(MONTH FROM starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS month,
    COUNT(*) AS event_count
  FROM events
  WHERE status = 'published'
  GROUP BY year, month
  ORDER BY year DESC, month DESC;
$$;

GRANT EXECUTE ON FUNCTION get_months_with_events() TO anon, authenticated;

COMMENT ON FUNCTION get_months_with_events IS
'Returns all year/month combinations that have published events.
Used for sitemap generation and month navigation.';


-- Get events for the current week (Monday to Sunday, Da Lat timezone)
CREATE OR REPLACE FUNCTION get_events_this_week(
  p_limit int DEFAULT 50
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
  AND starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh' >= date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  AND starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh' < date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '7 days'
  ORDER BY starts_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_events_this_week(int) TO anon, authenticated;

COMMENT ON FUNCTION get_events_this_week IS
'Returns published events starting this week (Monday-Sunday) in Da Lat timezone.
Used for /events/this-week page.';


-- Get events for the current month (Da Lat timezone)
CREATE OR REPLACE FUNCTION get_events_this_month(
  p_limit int DEFAULT 50
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
  AND EXTRACT(YEAR FROM starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  AND EXTRACT(MONTH FROM starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  ORDER BY starts_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_events_this_month(int) TO anon, authenticated;

COMMENT ON FUNCTION get_events_this_month IS
'Returns published events starting this month in Da Lat timezone.
Used for /events/this-month page.';
