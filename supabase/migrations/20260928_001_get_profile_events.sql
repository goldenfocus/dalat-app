-- Profile events RPC: correct upcoming/past split with series collapse.
--
-- Fixes: the profile page fetched events ORDER BY starts_at DESC LIMIT 10 —
-- the 10 FURTHEST-future events — so creators with long recurring series
-- (e.g. weekly karaoke through November) showed only far-future duplicate
-- instances while near-term events (including sponsored ones) were hidden,
-- and past events could never appear at all.
--
-- Semantics:
--   * upcoming: soonest first; each recurring series collapsed to its NEXT
--     occurrence (DISTINCT ON series_id; one-offs keyed by their own id).
--     An event with ends_at in the future counts as upcoming ("happening
--     now" stays visible during the event window).
--   * sponsored events (sponsor_tier set) always make the upcoming cut;
--     display order stays chronological.
--   * past: most recent first, same series collapse.
-- SECURITY INVOKER (default): RLS applies with the caller's role; anon can
-- already read published events and organizers.

CREATE OR REPLACE FUNCTION public.get_profile_events(
  p_profile_id uuid,
  p_upcoming_limit int DEFAULT 6,
  p_past_limit int DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH mine AS (
  SELECT e.*
  FROM events e
  WHERE e.status = 'published'
    AND (
      e.created_by = p_profile_id
      OR e.organizer_id IN (SELECT o.id FROM organizers o WHERE o.owner_id = p_profile_id)
    )
),
upcoming AS (
  SELECT DISTINCT ON (COALESCE(m.series_id, m.id)) m.*
  FROM mine m
  WHERE COALESCE(m.ends_at, m.starts_at) >= now()
  ORDER BY COALESCE(m.series_id, m.id), m.starts_at ASC
),
upcoming_limited AS (
  SELECT * FROM upcoming
  ORDER BY (sponsor_tier IS NULL), starts_at ASC
  LIMIT p_upcoming_limit
),
past AS (
  SELECT DISTINCT ON (COALESCE(m.series_id, m.id)) m.*
  FROM mine m
  WHERE COALESCE(m.ends_at, m.starts_at) < now()
  ORDER BY COALESCE(m.series_id, m.id), m.starts_at DESC
),
past_limited AS (
  SELECT * FROM past
  ORDER BY starts_at DESC
  LIMIT p_past_limit
)
SELECT jsonb_build_object(
  'upcoming', COALESCE(
    (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.starts_at ASC) FROM upcoming_limited u),
    '[]'::jsonb
  ),
  'past', COALESCE(
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.starts_at DESC) FROM past_limited p),
    '[]'::jsonb
  )
);
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_events(uuid, int, int) TO anon, authenticated;
