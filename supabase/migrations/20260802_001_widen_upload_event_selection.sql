-- ============================================
-- Widen event selection for moment upload FAB
--
-- Previously only showed events with 'going'/'interested' RSVPs
-- or events the user created. Now also includes:
-- 1. Events with 'waitlist' RSVP status
-- 2. Upcoming events (next 60 days) where anyone can post moments
-- ============================================

CREATE OR REPLACE FUNCTION get_user_recent_events_for_upload(
  p_user_id uuid,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  image_url text,
  starts_at timestamptz,
  location_name text,
  can_post_moments boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.slug,
    e.title,
    e.image_url,
    e.starts_at,
    e.location_name,
    -- Check if user can post moments
    -- Default to 'anyone' can post if no settings exist (consistent with app logic)
    CASE
      -- Creator can always post
      WHEN e.created_by = p_user_id THEN true
      -- If moments explicitly disabled, no one except creator can post
      WHEN es.moments_enabled = false THEN false
      -- No settings = default to 'anyone' can post
      WHEN es.event_id IS NULL THEN true
      -- Check who_can_post setting (defaults to 'anyone' if NULL)
      WHEN COALESCE(es.moments_who_can_post, 'anyone') = 'anyone' THEN true
      WHEN es.moments_who_can_post = 'rsvp' AND r.status IN ('going', 'interested', 'waitlist') THEN true
      WHEN es.moments_who_can_post = 'confirmed' AND r.status = 'going' THEN true
      ELSE false
    END as can_post_moments
  FROM events e
  LEFT JOIN rsvps r ON r.event_id = e.id AND r.user_id = p_user_id
  LEFT JOIN event_settings es ON es.event_id = e.id
  WHERE e.status = 'published'
    AND (
      -- Events user RSVP'd to in last 30 days (including waitlist)
      (r.user_id = p_user_id AND r.status IN ('going', 'interested', 'waitlist') AND e.starts_at > now() - interval '30 days')
      OR
      -- Events user created
      e.created_by = p_user_id
      OR
      -- Upcoming events (next 60 days) where anyone can post moments
      (
        e.starts_at > now() - interval '1 day'
        AND e.starts_at < now() + interval '60 days'
        AND (
          es.event_id IS NULL  -- no settings = defaults to 'anyone'
          OR (COALESCE(es.moments_enabled, true) AND COALESCE(es.moments_who_can_post, 'anyone') = 'anyone')
        )
      )
    )
  ORDER BY
    -- Prioritize events that just happened
    CASE WHEN e.starts_at < now() THEN 0 ELSE 1 END,
    ABS(EXTRACT(EPOCH FROM (e.starts_at - now()))) ASC
  LIMIT p_limit;
$$;
