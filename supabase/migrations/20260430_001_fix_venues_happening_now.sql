-- ============================================
-- FIX: Venues "Happening Now" Logic
-- Migration: 20260127_002_fix_venues_happening_now
-- ============================================
-- Bug: has_happening_now treated NULL ends_at as "happening forever"
-- Fix: Use 4-hour default duration (same as get_events_by_lifecycle)
-- ============================================

-- Fix get_venues_for_map
CREATE OR REPLACE FUNCTION get_venues_for_map(
  p_types text[] DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  venue_type text,
  latitude double precision,
  longitude double precision,
  logo_url text,
  is_verified boolean,
  upcoming_event_count bigint,
  has_happening_now boolean
)
LANGUAGE sql STABLE AS $$
  SELECT
    v.id, v.slug, v.name, v.venue_type,
    v.latitude, v.longitude, v.logo_url, v.is_verified,
    COUNT(e.id) FILTER (
      WHERE e.starts_at > now()
      AND e.status = 'published'
    ) as upcoming_event_count,
    EXISTS (
      SELECT 1 FROM events e2
      WHERE e2.venue_id = v.id
      AND e2.status = 'published'
      AND e2.starts_at <= now()
      AND (
        e2.ends_at >= now()
        OR (e2.ends_at IS NULL AND e2.starts_at + interval '4 hours' >= now())
      )
    ) as has_happening_now
  FROM venues v
  LEFT JOIN events e ON e.venue_id = v.id
  WHERE (p_types IS NULL OR v.venue_type = ANY(p_types))
  GROUP BY v.id
  ORDER BY has_happening_now DESC, upcoming_event_count DESC, v.priority_score DESC
  LIMIT p_limit;
$$;

-- Fix get_venues_for_discovery
CREATE OR REPLACE FUNCTION get_venues_for_discovery(
  p_type text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  venue_type text,
  logo_url text,
  cover_photo_url text,
  address text,
  is_verified boolean,
  price_range text,
  tags text[],
  operating_hours jsonb,
  upcoming_event_count bigint,
  has_happening_now boolean
)
LANGUAGE sql STABLE AS $$
  SELECT
    v.id, v.slug, v.name, v.venue_type,
    v.logo_url, v.cover_photo_url, v.address,
    v.is_verified, v.price_range, v.tags, v.operating_hours,
    COUNT(e.id) FILTER (
      WHERE e.starts_at > now() AND e.status = 'published'
    ) as upcoming_event_count,
    EXISTS (
      SELECT 1 FROM events e2
      WHERE e2.venue_id = v.id
      AND e2.status = 'published'
      AND e2.starts_at <= now()
      AND (
        e2.ends_at >= now()
        OR (e2.ends_at IS NULL AND e2.starts_at + interval '4 hours' >= now())
      )
    ) as has_happening_now
  FROM venues v
  LEFT JOIN events e ON e.venue_id = v.id
  WHERE (p_type IS NULL OR v.venue_type = p_type)
  GROUP BY v.id
  ORDER BY
    has_happening_now DESC,
    upcoming_event_count DESC,
    v.priority_score DESC,
    v.is_verified DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Also fix get_venue_by_slug happening_now check for consistency
CREATE OR REPLACE FUNCTION get_venue_by_slug(p_slug text)
RETURNS json
LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'venue', row_to_json(v),
    'upcoming_events', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', e.id,
          'slug', e.slug,
          'title', e.title,
          'image_url', e.image_url,
          'starts_at', e.starts_at,
          'ends_at', e.ends_at,
          'capacity', e.capacity
        ) ORDER BY e.starts_at
      ), '[]'::json)
      FROM events e
      WHERE e.venue_id = v.id
      AND e.status = 'published'
      AND e.starts_at > now()
      LIMIT 10
    ),
    'happening_now', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', e.id,
          'slug', e.slug,
          'title', e.title,
          'image_url', e.image_url,
          'starts_at', e.starts_at,
          'ends_at', e.ends_at
        )
      ), '[]'::json)
      FROM events e
      WHERE e.venue_id = v.id
      AND e.status = 'published'
      AND e.starts_at <= now()
      AND (
        e.ends_at >= now()
        OR (e.ends_at IS NULL AND e.starts_at + interval '4 hours' >= now())
      )
    ),
    'past_events_count', (
      SELECT COUNT(*)::int
      FROM events e
      WHERE e.venue_id = v.id
      AND e.status = 'published'
      AND COALESCE(e.ends_at, e.starts_at + interval '4 hours') < now()
    ),
    'recent_activity', json_build_object(
      'events_this_month', (
        SELECT COUNT(*)::int FROM events
        WHERE venue_id = v.id
        AND status = 'published'
        AND starts_at > now() - interval '30 days'
      ),
      'total_visitors', (
        SELECT COALESCE(COUNT(DISTINCT r.user_id), 0)::int
        FROM rsvps r
        JOIN events e ON e.id = r.event_id
        WHERE e.venue_id = v.id
        AND r.status = 'going'
        AND e.starts_at > now() - interval '90 days'
      )
    )
  )
  FROM venues v
  WHERE v.slug = p_slug;
$$;
