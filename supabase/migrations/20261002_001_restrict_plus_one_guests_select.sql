-- ============================================
-- Restrict plus_one_guests SELECT (PII fix)
-- ============================================
-- The original policy was `USING (true)`: anyone (including anon) could read
-- every plus-one guest's name and email via the public REST API. Restrict
-- visibility to the people who need it:
--   1. the RSVP owner (manages their own guests)
--   2. the event creator (host check-in reads rsvps + plus_one_guests)
--   3. admins
-- Applied manually to prod on 2026-07-09 (version 20261002); table was empty
-- at the time, so no data was exposed.

DROP POLICY IF EXISTS "Anyone can view plus one guests" ON plus_one_guests;

CREATE POLICY "Guests visible to rsvp owner, event host, admin"
  ON plus_one_guests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rsvps r
      WHERE r.id = plus_one_guests.rsvp_id
        AND r.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM rsvps r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = plus_one_guests.rsvp_id
        AND e.created_by = auth.uid()
    )
    OR is_admin()
  );
