-- Alive Homepage Phase 1: fallback covers from past occurrences, past-proof
-- stats, organizer auto-RSVP, seed_profiles registry (empty until Phase 2).
-- Spec: docs/superpowers/specs/2026-07-09-alive-homepage-design.md
-- NOTE: does NOT touch get_events_by_lifecycle_deduplicated /
-- get_upcoming_events_paginated / get_homepage_moments_strip.

-- ===========================================
-- 1. NEW DENORMALIZED COLUMNS ON EVENTS
-- ===========================================
-- Resolved write-time by refresh_fallback_covers(); cards read them via a
-- side-channel batch fetch (getCachedEventSocialBatch), never via feed RPCs.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS fallback_image_url text,
  ADD COLUMN IF NOT EXISTS fallback_moment_id uuid,
  ADD COLUMN IF NOT EXISTS fallback_photo_credit text,
  ADD COLUMN IF NOT EXISTS last_occurrence_went int,
  ADD COLUMN IF NOT EXISTS last_occurrence_photos int;

-- ===========================================
-- 2. SEED PROFILES REGISTRY — SERVICE ROLE ONLY
-- ===========================================
-- RLS enabled with no policies = deny-all for anon/authenticated; the
-- service role bypasses RLS. Created in Phase 1 so stats exclude it from
-- day one. Membership must NEVER be exposed on a public table.

CREATE TABLE IF NOT EXISTS seed_profiles (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE seed_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seed_profiles FROM anon, authenticated;

-- ===========================================
-- 3. NOTIFICATION TYPE FOR PHOTOGRAPHER CREDIT
-- ===========================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'photo_featured';

-- ===========================================
-- 4. NIGHTLY REFRESH FUNCTION
-- ===========================================
-- Resolves fallback cover + past-proof stats for upcoming imageless series
-- events. Returns newly-credited photographers so the cron route can notify
-- them exactly once (only rows whose fallback_moment_id changed).

CREATE OR REPLACE FUNCTION refresh_fallback_covers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
  v_credited jsonb;
BEGIN
  CREATE TEMP TABLE tmp_fallback ON COMMIT DROP AS
  WITH upcoming AS (
    SELECT e.id, e.series_id, e.created_by, e.organizer_id, e.source_platform,
           e.title, e.slug, e.fallback_moment_id AS old_moment_id
    FROM events e
    WHERE e.status = 'published'
      AND e.starts_at > now()
      AND (e.image_url IS NULL OR e.image_url = '')
  ),
  prev AS (
    -- most recent PAST occurrence in the same series (stats source: "last
    -- time" must always mean THIS event's series, never another event)
    SELECT DISTINCT ON (u.id)
      u.id AS upcoming_id, p.id AS prev_event_id
    FROM upcoming u
    JOIN events p ON u.series_id IS NOT NULL
      AND p.series_id = u.series_id
      AND p.starts_at < now()
      AND p.status = 'published'
    ORDER BY u.id, p.starts_at DESC
  ),
  best AS (
    -- best cover photo: same series wins, else same creator/organizer's past
    -- NATIVE events (imports all share SYSTEM_USER_ID as creator — matching
    -- them by creator would cross-pollinate covers between unrelated scraped
    -- events). Within a tier: curated cover_moment_id, then quality score.
    SELECT DISTINCT ON (u.id)
      u.id AS upcoming_id,
      m.id AS moment_id, m.media_url, m.user_id AS photographer_id,
      prof.username AS photographer_username
    FROM upcoming u
    JOIN events p ON p.starts_at < now() AND p.status = 'published'
      AND (
        (u.series_id IS NOT NULL AND p.series_id = u.series_id)
        OR (
          (u.source_platform IS NULL OR u.source_platform = 'manual')
          AND (p.source_platform IS NULL OR p.source_platform = 'manual')
          AND (p.created_by = u.created_by
               OR (u.organizer_id IS NOT NULL AND p.organizer_id = u.organizer_id))
        )
      )
    JOIN moments m ON m.event_id = p.id
      AND m.status = 'published'
      AND m.content_type IN ('photo', 'image')
      AND m.media_url IS NOT NULL AND m.media_url <> ''
    LEFT JOIN moment_metadata mm ON mm.moment_id = m.id
    JOIN profiles prof ON prof.id = m.user_id
    ORDER BY u.id,
      CASE WHEN u.series_id IS NOT NULL AND p.series_id = u.series_id THEN 0 ELSE 1 END,
      CASE WHEN p.cover_moment_id = m.id THEN 0 ELSE 1 END,
      COALESCE(mm.quality_score, 0.5) DESC,
      m.created_at DESC
  ),
  stats AS (
    -- "went" counts plain going (seed-excluded): the check-in feature is
    -- unused, so auto_mark_no_shows brands ~everyone a no-show — filtering
    -- on no_show_at would zero all real history
    SELECT pr.upcoming_id,
      (SELECT COALESCE(SUM(1 + r.plus_ones), 0)::int
         FROM rsvps r
        WHERE r.event_id = pr.prev_event_id
          AND r.status = 'going'
          AND NOT EXISTS (SELECT 1 FROM seed_profiles s
                           WHERE s.profile_id = r.user_id)) AS went,
      (SELECT COUNT(*)::int
         FROM moments m
        WHERE m.event_id = pr.prev_event_id
          AND m.status = 'published'
          AND m.content_type IN ('photo', 'image')) AS photos
    FROM prev pr
  )
  SELECT u.id AS upcoming_id, u.title, u.slug, u.old_moment_id,
         b.moment_id, b.media_url, b.photographer_id, b.photographer_username,
         s.went, s.photos
  FROM upcoming u
  LEFT JOIN best b ON b.upcoming_id = u.id
  LEFT JOIN stats s ON s.upcoming_id = u.id
  WHERE b.moment_id IS NOT NULL OR s.upcoming_id IS NOT NULL;

  -- newly credited photographers (moment changed and exists)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'event_id', t.upcoming_id,
    'event_title', t.title,
    'event_slug', t.slug,
    'moment_id', t.moment_id,
    'photographer_id', t.photographer_id,
    'photographer_username', t.photographer_username
  )), '[]'::jsonb)
  INTO v_credited
  FROM tmp_fallback t
  WHERE t.moment_id IS NOT NULL
    AND t.moment_id IS DISTINCT FROM t.old_moment_id;

  UPDATE events e
  SET fallback_image_url = t.media_url,
      fallback_moment_id = t.moment_id,
      fallback_photo_credit = t.photographer_username,
      last_occurrence_went = t.went,
      last_occurrence_photos = t.photos
  FROM tmp_fallback t
  WHERE e.id = t.upcoming_id
    AND (e.fallback_moment_id IS DISTINCT FROM t.moment_id
      OR e.fallback_image_url IS DISTINCT FROM t.media_url
      OR e.last_occurrence_went IS DISTINCT FROM t.went
      OR e.last_occurrence_photos IS DISTINCT FROM t.photos);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated,
                            'credited', v_credited);
END;
$$;
REVOKE ALL ON FUNCTION refresh_fallback_covers() FROM anon, authenticated, public;

-- ===========================================
-- 5. DELETION HYGIENE
-- ===========================================
-- A deleted/unpublished moment must never linger as a cover.

CREATE OR REPLACE FUNCTION clear_fallback_on_moment_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.status <> 'published' THEN
    UPDATE events
    SET fallback_image_url = NULL,
        fallback_moment_id = NULL,
        fallback_photo_credit = NULL
    WHERE fallback_moment_id = OLD.id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS on_moment_removed_clear_fallback ON moments;
CREATE TRIGGER on_moment_removed_clear_fallback
AFTER DELETE OR UPDATE OF status ON moments
FOR EACH ROW EXECUTE FUNCTION clear_fallback_on_moment_removal();

-- ===========================================
-- 6. CREATOR AUTO-RSVP ON SERIES OCCURRENCES
-- ===========================================
-- ENTIRE function copied from 20260129_001_recurring_events.sql:121-137,
-- with the creator block appended before RETURN NEW. Subscriber logic is
-- byte-identical — do not rewrite it.

CREATE OR REPLACE FUNCTION auto_rsvp_for_series_subscribers()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if this event belongs to a series
  IF NEW.series_id IS NOT NULL THEN
    -- Create RSVPs for all series subscribers
    INSERT INTO rsvps (event_id, user_id, status, plus_ones)
    SELECT NEW.id, sr.user_id, 'going', 0
    FROM series_rsvps sr
    WHERE sr.series_id = NEW.series_id
      AND sr.auto_rsvp = true
    ON CONFLICT (event_id, user_id) DO NOTHING;
  END IF;

  -- Auto-RSVP the series creator (skip imported events: one importer
  -- avatar "going" to every scraped event is anti-social-proof and
  -- pollutes get_recommended_events' ln(1+going) ranking)
  IF NEW.created_by IS NOT NULL
     AND (NEW.source_platform IS NULL OR NEW.source_platform = 'manual') THEN
    INSERT INTO rsvps (event_id, user_id, status, plus_ones)
    VALUES (NEW.id, NEW.created_by, 'going', 0)
    ON CONFLICT (event_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 7. BACKFILL: ORGANIZER RSVP, UPCOMING EVENTS ONLY
-- ===========================================
-- Guards: upcoming-only (auto_mark_no_shows must not brand organizers
-- no-shows on past events); created_at backdated past the 7-day
-- get_friend_activity() window (no feed flood); skip imported events; skip
-- full events (never displace capacity); ON CONFLICT keeps explicit
-- cancelled/interested choices.

INSERT INTO rsvps (event_id, user_id, status, plus_ones, created_at)
SELECT e.id, e.created_by, 'going', 0, now() - interval '8 days'
FROM events e
WHERE e.status = 'published'
  AND e.starts_at > now()
  AND e.created_by IS NOT NULL
  AND (e.source_platform IS NULL OR e.source_platform = 'manual')
  AND (e.capacity IS NULL OR
       (SELECT COALESCE(SUM(1 + r.plus_ones), 0) FROM rsvps r
         WHERE r.event_id = e.id AND r.status = 'going') < e.capacity)
ON CONFLICT (event_id, user_id) DO NOTHING;
