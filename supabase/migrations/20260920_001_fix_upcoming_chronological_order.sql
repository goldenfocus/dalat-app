-- ============================================
-- FIX: Restore chronological order for upcoming events
-- Migration: 20260920_001_fix_upcoming_chronological_order
-- ============================================
-- Problem: sponsor_tier was the PRIMARY sort key, so sponsored events
-- on March 7 would appear before non-sponsored events on Feb 22,
-- creating a visible "gap" in the upcoming feed.
--
-- Fix: Sort chronologically first. Sponsors get a badge, not queue-jumping.

DROP FUNCTION IF EXISTS get_events_by_lifecycle_deduplicated(text, int);

CREATE OR REPLACE FUNCTION get_events_by_lifecycle_deduplicated(
  p_lifecycle text,  -- 'upcoming', 'happening', 'past'
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  -- All event columns (in order from 20260428 version)
  id uuid,
  slug text,
  previous_slugs text[],
  tribe_id uuid,
  tribe_visibility text,
  organizer_id uuid,
  venue_id uuid,
  title text,
  description text,
  image_url text,
  location_name text,
  address text,
  google_maps_url text,
  latitude double precision,
  longitude double precision,
  external_chat_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  capacity int,
  is_online boolean,
  online_link text,
  title_position text,
  image_fit text,
  focal_point text,
  price_type text,
  ticket_tiers jsonb,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  source_locale text,
  ai_tags text[],
  ai_tags_updated_at timestamptz,
  spam_score double precision,
  spam_reason text,
  spam_checked_at timestamptz,
  series_id uuid,
  series_instance_date date,
  is_exception boolean,
  exception_type text,
  -- Additional series metadata for badge display
  series_slug text,
  series_rrule text,
  is_recurring boolean,
  -- Sponsorship (returned for badge display, not used for sorting)
  sponsor_tier smallint
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
    r.tribe_id,
    r.tribe_visibility,
    r.organizer_id,
    r.venue_id,
    r.title,
    r.description,
    r.image_url,
    r.location_name,
    r.address,
    r.google_maps_url,
    r.latitude,
    r.longitude,
    r.external_chat_url,
    r.starts_at,
    r.ends_at,
    r.timezone,
    r.capacity,
    r.is_online,
    r.online_link,
    r.title_position,
    r.image_fit,
    r.focal_point,
    r.price_type,
    r.ticket_tiers,
    r.status,
    r.created_by,
    r.created_at,
    r.updated_at,
    r.source_locale,
    r.ai_tags,
    r.ai_tags_updated_at,
    r.spam_score,
    r.spam_reason,
    r.spam_checked_at,
    r.series_id,
    r.series_instance_date,
    r.is_exception,
    r.exception_type,
    r.series_slug,
    r.series_rrule,
    r.is_recurring,
    r.sponsor_tier
  FROM ranked r
  WHERE r.rn = 1  -- Only first per series (or the event itself for one-offs)
  ORDER BY
    -- PRIMARY: Always chronological (soonest upcoming, most recent past)
    CASE WHEN p_lifecycle = 'past' THEN NULL ELSE r.starts_at END ASC NULLS LAST,
    CASE WHEN p_lifecycle = 'past' THEN r.starts_at ELSE NULL END DESC NULLS LAST
  LIMIT p_limit;
$$;

-- Grant access to both anonymous and authenticated users
GRANT EXECUTE ON FUNCTION get_events_by_lifecycle_deduplicated(text, int) TO anon, authenticated;

COMMENT ON FUNCTION get_events_by_lifecycle_deduplicated IS
'Returns events filtered by lifecycle state with series deduplication.
Shows only ONE entry per recurring series (next upcoming or most recent past).
Includes series_slug, series_rrule, sponsor_tier for badge display.
ORDER IS ALWAYS CHRONOLOGICAL — sponsor_tier does NOT affect sort order.
- upcoming: next instance per series, sorted soonest first
- happening: events currently in progress
- past: most recent instance per series, sorted most recent first';
