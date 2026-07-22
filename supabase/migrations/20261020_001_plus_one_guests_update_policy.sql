-- Owner-scoped UPDATE policy for plus_one_guests.
--
-- The table had SELECT/INSERT/DELETE policies but no UPDATE policy, so the
-- invite flow's link-back (setting invitation_id on a guest row) was a silent
-- no-op under RLS. Scope updates to the RSVP owner so it works without
-- opening an IDOR (any wider policy would let callers stamp invitation_id
-- onto other people's guests).
--
-- NOTE: applied manually via Management API on 2026-07-22 and recorded in
-- schema_migrations by hand (this repo has no migration CI). The permissive
-- "Anyone can view plus one guests" SELECT policy from the 20260731 draft
-- migration was already replaced in prod by the scoped
-- "Guests visible to rsvp owner, event host, admin" policy.

CREATE POLICY "Users can update own guests"
  ON plus_one_guests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rsvps
      WHERE rsvps.id = plus_one_guests.rsvp_id
      AND rsvps.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rsvps
      WHERE rsvps.id = plus_one_guests.rsvp_id
      AND rsvps.user_id = auth.uid()
    )
  );
