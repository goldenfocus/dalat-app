-- ============================================
-- Fix: Default to 'anyone' when no event_settings exist
--
-- Bug: The RPC function returned can_post_moments=false when
-- there was no event_settings row, but the app defaults to
-- "anyone can post" when no settings exist.
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
      -- Events user RSVP'd to in last 30 days
      (r.user_id = p_user_id AND r.status IN ('going', 'interested') AND e.starts_at > now() - interval '30 days')
      OR
      -- Events user created
      e.created_by = p_user_id
    )
  ORDER BY
    -- Prioritize events that just happened
    CASE WHEN e.starts_at < now() THEN 0 ELSE 1 END,
    ABS(EXTRACT(EPOCH FROM (e.starts_at - now()))) ASC
  LIMIT p_limit;
$$;
