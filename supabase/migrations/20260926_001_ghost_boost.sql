-- Ghost boost: small seeded attendance while the app is young.
-- seed_profiles table created in 20260925_001 (service-role-only registry).
-- Constraints (red-team hardened): capacity-NULL events ONLY (never touches
-- waitlist/promote_from_waitlist machinery), max 2-3 per event, jittered
-- public timestamps, withdrawn 3h before start.
-- Kill switch: GHOST_BOOST_ENABLED env flag on the cron; full purge is
--   DELETE FROM rsvps r USING seed_profiles s WHERE r.user_id = s.profile_id;

CREATE OR REPLACE FUNCTION ghost_boost_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawn int := 0;
  v_added int := 0;
  v_event record;
  v_ghost uuid;
  v_ghost_count int;
BEGIN
  -- 1) Withdraw: events starting within 3 hours (or already started/past —
  -- also self-heals any rows a previously failed tick left behind)
  WITH gone AS (
    DELETE FROM rsvps r
    USING seed_profiles s, events e
    WHERE r.user_id = s.profile_id
      AND r.event_id = e.id
      AND e.starts_at < now() + interval '3 hours'
    RETURNING r.id
  )
  SELECT count(*) INTO v_withdrawn FROM gone;

  -- 2) Seed: at most ONE ghost per eligible event per tick; ~50% random skip
  -- per tick so RSVPs spread naturally across hours.
  FOR v_event IN
    SELECT e.id,
           2 + (abs(hashtext(e.id::text)) % 2) AS target  -- 2 or 3, stable per event
    FROM events e
    WHERE e.status = 'published'
      AND e.capacity IS NULL                              -- hard rule: no capacity events
      AND e.starts_at > now() + interval '6 hours'
      AND e.starts_at < now() + interval '7 days'
      AND (SELECT COALESCE(SUM(1 + r.plus_ones), 0)
             FROM rsvps r
            WHERE r.event_id = e.id AND r.status = 'going'
              AND NOT EXISTS (SELECT 1 FROM seed_profiles s
                               WHERE s.profile_id = r.user_id)) < 3
  LOOP
    CONTINUE WHEN random() < 0.5;

    SELECT count(*) INTO v_ghost_count
    FROM rsvps r JOIN seed_profiles s ON s.profile_id = r.user_id
    WHERE r.event_id = v_event.id AND r.status = 'going';
    CONTINUE WHEN v_ghost_count >= v_event.target;

    SELECT s.profile_id INTO v_ghost
    FROM seed_profiles s
    WHERE NOT EXISTS (SELECT 1 FROM rsvps r
                       WHERE r.event_id = v_event.id
                         AND r.user_id = s.profile_id)
    ORDER BY random()
    LIMIT 1;

    IF v_ghost IS NOT NULL THEN
      -- backdate up to 45min: rsvps.created_at is publicly readable; exact
      -- on-the-hour timestamps would fingerprint the cron
      INSERT INTO rsvps (event_id, user_id, status, plus_ones, created_at)
      VALUES (v_event.id, v_ghost, 'going', 0,
              now() - (random() * interval '45 minutes'))
      ON CONFLICT (event_id, user_id) DO NOTHING;
      v_added := v_added + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'withdrawn', v_withdrawn, 'added', v_added);
END;
$$;
REVOKE ALL ON FUNCTION ghost_boost_tick() FROM anon, authenticated, public;
