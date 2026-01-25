-- ============================================
-- LINK VENUES TO ORGANIZERS
-- ============================================
--
-- This migration adds the ability to link a venue to an organizer.
-- Use case: "Phố Bên Đồi" the venue can be linked to "Phố Bên Đồi" the organizer.
--
-- Benefits:
-- - When creating an event at a venue, auto-suggest the linked organizer
-- - Venue page can display organizer's verified badge and social links
-- - Organizer profile can show "Our Venues" section
-- - One organizer can have multiple venues (chains/franchises)
-- - No data duplication - identity lives on organizer, location on venue
-- ============================================

-- Add organizer_id to venues
ALTER TABLE venues ADD COLUMN IF NOT EXISTS organizer_id uuid REFERENCES organizers(id) ON DELETE SET NULL;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_venues_organizer ON venues(organizer_id) WHERE organizer_id IS NOT NULL;

COMMENT ON COLUMN venues.organizer_id IS 'Optional link to an organizer. When set, the venue "belongs to" this organizer (e.g., a café that hosts its own events).';

-- ============================================
-- UPDATE get_venue_by_slug TO INCLUDE ORGANIZER
-- ============================================

CREATE OR REPLACE FUNCTION get_venue_by_slug(p_slug text)
RETURNS json
LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'venue', row_to_json(v),
    'organizer', (
      SELECT CASE
        WHEN v.organizer_id IS NOT NULL THEN
          json_build_object(
            'id', o.id,
            'slug', o.slug,
            'name', o.name,
            'logo_url', o.logo_url,
            'is_verified', o.is_verified,
            'website_url', o.website_url,
            'facebook_url', o.facebook_url,
            'instagram_url', o.instagram_url
          )
        ELSE NULL
      END
      FROM organizers o
      WHERE o.id = v.organizer_id
    ),
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
      AND COALESCE(e.ends_at, e.starts_at + interval '4 hours') > now()
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

-- ============================================
-- NEW FUNCTION: Get venues by organizer
-- ============================================

CREATE OR REPLACE FUNCTION get_venues_by_organizer(p_organizer_id uuid)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  venue_type text,
  address text,
  logo_url text,
  cover_photo_url text,
  is_verified boolean,
  upcoming_event_count bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    v.id, v.slug, v.name, v.venue_type,
    v.address, v.logo_url, v.cover_photo_url, v.is_verified,
    COUNT(e.id) FILTER (
      WHERE e.starts_at > now() AND e.status = 'published'
    ) as upcoming_event_count
  FROM venues v
  LEFT JOIN events e ON e.venue_id = v.id
  WHERE v.organizer_id = p_organizer_id
  GROUP BY v.id
  ORDER BY v.priority_score DESC, v.name;
$$;

GRANT EXECUTE ON FUNCTION get_venues_by_organizer(uuid) TO anon, authenticated;
