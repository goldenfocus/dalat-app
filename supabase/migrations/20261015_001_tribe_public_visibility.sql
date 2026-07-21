-- Public tribe visibility + tribes on profiles + event moment thumbnails.
--
-- PROBLEM (the "0 members" bug):
--   tribe_members_select RLS (20260204_001) only exposes rows to the member
--   themselves, fellow members, or the creator. The tribe detail page asked
--   PostgREST for `tribe_members(count)`, and RLS is applied BEFORE the
--   aggregate — so a non-member counts zero VISIBLE rows and gets a clean `0`,
--   with no error. A public tribe with 3 members advertised "0 members" to
--   every prospective joiner.
--   (The /tribes browse page was NOT affected: getDiscoverTribes selects
--   explicit columns and TribeCard never rendered a count.)
--
-- APPROACH:
--   Rather than loosening tribe_members_select (which would expose membership
--   of invite_only/secret tribes too), keep RLS exactly as-is and add:
--     1. tribes.member_count  — trigger-maintained, no identities exposed,
--        readable by everyone, no N+1.
--     2. SECURITY DEFINER readers that expose identities ONLY for tribes that
--        are already discoverable (access_type public/request AND is_listed).
--   Exposure stays explicit and auditable in one place instead of being an
--   emergent property of a policy predicate.
--
-- "Discoverable" mirrors the existing browse filter in app/api/tribes/route.ts:
--   access_type IN ('public','request') AND is_listed. invite_only and secret
--   tribes never leak members or appear on profiles.

-- ---------------------------------------------------------------------------
-- 1. Denormalised member count
-- ---------------------------------------------------------------------------

ALTER TABLE tribes ADD COLUMN IF NOT EXISTS member_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_tribe_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Recompute from scratch for the affected tribe(s) rather than +1/-1.
  --
  -- CONCURRENCY: the lock must be taken in its OWN statement, before the
  -- recount. Under READ COMMITTED, an UPDATE that blocks on a row lock re-
  -- evaluates its WHERE against the newly committed row version, but the
  -- subquery in its SET clause still uses the statement's ORIGINAL snapshot —
  -- it sees concurrent changes to the row it is updating, not to *other*
  -- rows. Two simultaneous joins would each count only their own insert and
  -- settle on 1 instead of 2, staying wrong until the next uncontended write.
  -- plpgsql gives each statement a fresh snapshot, so locking first and
  -- recounting second makes the count correct under concurrency.
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM 1 FROM tribes WHERE id = NEW.tribe_id FOR UPDATE;

    UPDATE tribes t
    SET member_count = (
      SELECT count(*) FROM tribe_members m
      WHERE m.tribe_id = NEW.tribe_id AND m.status = 'active'
    )
    WHERE t.id = NEW.tribe_id;
  END IF;

  -- On DELETE, or an UPDATE that moved the row between tribes, the old tribe
  -- also needs recounting.
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.tribe_id IS DISTINCT FROM NEW.tribe_id) THEN
    PERFORM 1 FROM tribes WHERE id = OLD.tribe_id FOR UPDATE;

    UPDATE tribes t
    SET member_count = (
      SELECT count(*) FROM tribe_members m
      WHERE m.tribe_id = OLD.tribe_id AND m.status = 'active'
    )
    WHERE t.id = OLD.tribe_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tribe_member_count ON tribe_members;
CREATE TRIGGER trg_sync_tribe_member_count
AFTER INSERT OR UPDATE OR DELETE ON tribe_members
FOR EACH ROW EXECUTE FUNCTION public.sync_tribe_member_count();

-- Backfill existing tribes.
UPDATE tribes t
SET member_count = COALESCE((
  SELECT count(*) FROM tribe_members m
  WHERE m.tribe_id = t.id AND m.status = 'active'
), 0);

-- ---------------------------------------------------------------------------
-- 2. Public tribe roster
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_tribe_public_members(
  p_slug text,
  p_limit int DEFAULT 24
)
RETURNS TABLE (
  user_id uuid,
  role text,
  joined_at timestamptz,
  display_name text,
  username text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    m.user_id,
    m.role::text,
    m.joined_at,
    p.display_name,
    p.username,
    p.avatar_url
  FROM tribe_members m
  JOIN tribes t ON t.id = m.tribe_id
  LEFT JOIN profiles p ON p.id = m.user_id
  WHERE t.slug = p_slug
    -- Gate: only tribes that are already discoverable expose their roster.
    AND t.access_type IN ('public', 'request')
    AND t.is_listed
    AND m.status = 'active'
  -- Leaders first, then admins, then members by seniority: the roster answers
  -- "who runs this?" before "who's in it?".
  ORDER BY
    CASE m.role WHEN 'leader' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    m.joined_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_tribe_public_members(text, int) TO anon, authenticated;

COMMENT ON FUNCTION public.get_tribe_public_members IS
  'Roster for discoverable tribes (public/request + is_listed) only. Bypasses tribe_members RLS deliberately; invite_only and secret tribes return zero rows.';

-- ---------------------------------------------------------------------------
-- 3. A user's public tribes (for profile pages)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_public_tribes(
  p_user_id uuid,
  p_limit int DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  cover_image_url text,
  member_count integer,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id,
    t.slug,
    t.name,
    t.cover_image_url,
    t.member_count,
    m.role::text
  FROM tribe_members m
  JOIN tribes t ON t.id = m.tribe_id
  WHERE m.user_id = p_user_id
    AND m.status = 'active'
    -- tribe_members.show_on_profile has existed (DEFAULT true) since the
    -- original tribes v2 migration but was never read by anything. Honouring
    -- it here costs nothing, defaults to the requested always-on behaviour,
    -- and finishes the opt-out the schema already anticipated.
    AND COALESCE(m.show_on_profile, true)
    -- Same gate: a user's membership in a secret tribe is never disclosed.
    AND t.access_type IN ('public', 'request')
    AND t.is_listed
  ORDER BY
    CASE m.role WHEN 'leader' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    t.member_count DESC,
    m.joined_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_public_tribes(uuid, int) TO anon, authenticated;

COMMENT ON FUNCTION public.get_user_public_tribes IS
  'Discoverable tribes a user belongs to, for public profile pages. Never discloses invite_only or secret memberships.';

-- ---------------------------------------------------------------------------
-- 4. Top moments per event (profile past-event thumbnail galleries)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_events_top_moments(
  p_event_ids uuid[],
  p_per_event int DEFAULT 4
)
RETURNS TABLE (
  event_id uuid,
  moments jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT
      m.id,
      m.event_id,
      m.content_type::text AS content_type,
      m.media_url,
      m.thumbnail_url,
      ROW_NUMBER() OVER (
        PARTITION BY m.event_id
        ORDER BY
          -- 1. Editorial curation wins outright: the organiser already picked
          --    a cover / vibe set for this event.
          CASE
            WHEN e.cover_moment_id = m.id THEN 0
            WHEN m.id = ANY(COALESCE(e.vibe_moment_ids, ARRAY[]::uuid[])) THEN 1
            WHEN e.fallback_moment_id = m.id THEN 2
            ELSE 3
          END,
          -- 2. Admin-boosted moments (index idx_moments_featured: higher wins).
          m.featured_priority DESC NULLS LAST,
          -- 3. Engagement. NOTE: as of this migration there are 3 likes across
          --    2466 moments, so this is near-inert today by design — it is
          --    placed here so the gallery self-corrects toward "most liked"
          --    as engagement grows, without shipping a dead ranking now.
          COALESCE(l.like_count, 0) DESC,
          COALESCE(m.view_count, 0) DESC,
          -- 4. Recency as the final tiebreak.
          m.created_at DESC
      ) AS rank
    FROM moments m
    JOIN events e ON e.id = m.event_id
    -- LATERAL so the like count is computed per candidate moment. A plain
    -- grouped subquery has no correlation to p_event_ids and would aggregate
    -- the whole moment_likes table on every profile render — free at today's
    -- 3 likes, but it gets slower exactly as this ranking input starts to
    -- matter.
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS like_count
      FROM moment_likes ml
      WHERE ml.moment_id = m.id
    ) l ON true
    WHERE m.event_id = ANY(p_event_ids)
      AND m.status = 'published'
      AND e.status = 'published'
      -- Text moments have nothing to show in a thumbnail strip.
      AND m.content_type::text IN ('photo', 'video')
      AND COALESCE(m.thumbnail_url, m.media_url) IS NOT NULL
  )
  SELECT
    r.event_id,
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'content_type', r.content_type,
        'media_url', r.media_url,
        'thumbnail_url', r.thumbnail_url
      )
      ORDER BY r.rank
    ) AS moments
  FROM ranked r
  WHERE r.rank <= p_per_event
  GROUP BY r.event_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_events_top_moments(uuid[], int) TO anon, authenticated;

COMMENT ON FUNCTION public.get_events_top_moments IS
  'Top N published photo/video moments per event for thumbnail strips. Ranked by editorial curation, then featured_priority, then likes/views, then recency.';
