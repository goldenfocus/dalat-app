-- ============================================
-- FEED DEDUPLICATION FOR RECURRING EVENTS
-- Migration: 20260222_002_feed_deduplication
-- ============================================
-- Shows only ONE entry per recurring series (the next upcoming instance)
-- while preserving all one-off events. Joins event_series to return
-- series metadata for badge display.

CREATE OR REPLACE FUNCTION get_events_by_lifecycle_deduplicated(
  p_lifecycle text,  -- 'upcoming', 'happening', 'past'
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  -- All event columns
  id uuid,
  slug text,
  previous_slugs text[],
  title text,
  description text,
  image_url text,
  location_name text,
  address text,
  google_maps_url text,
  external_chat_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  capacity int,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  tribe_id uuid,
  tribe_visibility text,
  organizer_id uuid,
  created_by uuid,
  source_locale text,
  series_id uuid,
  series_instance_date date,
  is_exception boolean,
  exception_type text,
  -- Additional series metadata
  series_slug text,
  series_rrule text,
  is_recurring boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lifecycle_filtered AS (
    SELECT e.*
    FROM events e
    WHERE e.status = 'published'
    AND CASE p_lifecycle
      -- Upcoming: starts in the future
      WHEN 'upcoming' THEN e.starts_at > now()

      -- Happening Now: started but not ended
      WHEN 'happening' THEN
        e.starts_at <= now()
        AND (
          e.ends_at >= now()
          OR (e.ends_at IS NULL AND e.starts_at + interval '4 hours' >= now())
        )

      -- Past: has ended
      WHEN 'past' THEN
        (e.ends_at IS NOT NULL AND e.ends_at < now())
        OR (e.ends_at IS NULL AND e.starts_at + interval '4 hours' < now())

      ELSE false
    END
  ),
  ranked AS (
    SELECT
      lf.*,
      es.slug AS series_slug,
      es.rrule AS series_rrule,
      (lf.series_id IS NOT NULL) AS is_recurring,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(lf.series_id, lf.id)
        ORDER BY
          -- For upcoming/happening: earliest first (next instance)
          -- For past: latest first (most recent instance)
          CASE WHEN p_lifecycle = 'past' THEN NULL ELSE lf.starts_at END ASC NULLS LAST,
          CASE WHEN p_lifecycle = 'past' THEN lf.starts_at ELSE NULL END DESC NULLS LAST
      ) AS rn
    FROM lifecycle_filtered lf
    LEFT JOIN event_series es ON lf.series_id = es.id
  )
  SELECT
    r.id,
    r.slug,
    r.previous_slugs,
    r.title,
    r.description,
    r.image_url,
    r.location_name,
    r.address,
    r.google_maps_url,
    r.external_chat_url,
    r.starts_at,
    r.ends_at,
    r.timezone,
    r.capacity,
    r.status,
    r.created_at,
    r.updated_at,
    r.tribe_id,
    r.tribe_visibility,
    r.organizer_id,
    r.created_by,
    r.source_locale,
    r.series_id,
    r.series_instance_date,
    r.is_exception,
    r.exception_type,
    r.series_slug,
    r.series_rrule,
    r.is_recurring
  FROM ranked r
  WHERE r.rn = 1  -- Only first per series (or the event itself for one-offs)
  ORDER BY
    -- Past events: most recent first (descending)
    -- Upcoming/Happening: soonest first (ascending)
    CASE WHEN p_lifecycle = 'past' THEN NULL ELSE r.starts_at END ASC NULLS LAST,
    CASE WHEN p_lifecycle = 'past' THEN r.starts_at ELSE NULL END DESC NULLS LAST
  LIMIT p_limit;
$$;

-- Grant access to both anonymous and authenticated users
GRANT EXECUTE ON FUNCTION get_events_by_lifecycle_deduplicated(text, int) TO anon, authenticated;

COMMENT ON FUNCTION get_events_by_lifecycle_deduplicated IS
'Returns events filtered by lifecycle state with series deduplication.
Shows only ONE entry per recurring series (next upcoming or most recent past).
Includes series_slug and series_rrule for badge display.
- upcoming: next instance per series that hasn''t started yet
- happening: events currently in progress
- past: most recent instance per series that has ended';
