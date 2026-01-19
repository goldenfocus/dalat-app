-- Fix archive page issues:
-- 1. Filter out future events (shouldn't see Jan 24 when today is Jan 19)
-- 2. Sort most recent first (DESC) for better UX when browsing past events

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
  -- Only show events that have already started (no future events in archive)
  AND starts_at <= now()
  ORDER BY starts_at DESC  -- Most recent first
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_events_by_month IS
'Returns published PAST events for a specific year/month in Da Lat timezone.
Events are sorted most recent first. Future events within the month are excluded.
Used for archive pages like /events/2026/january';
