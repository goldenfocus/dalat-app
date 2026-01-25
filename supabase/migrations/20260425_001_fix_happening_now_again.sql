-- Fix "happening now" logic AGAIN
-- Bug: Migration 20260424 reverted the fix from 20260423
-- This restores the correct COALESCE logic

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
