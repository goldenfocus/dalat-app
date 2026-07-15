-- Admins couldn't cancel another user's recurring series: the API's permission
-- check allows admins, but RLS blocked both writes and the route swallowed the
-- errors (returned success while changing nothing).
--
--   1. event_series had no admin UPDATE policy (creator-only), so the series
--      status update matched 0 rows.
--   2. events has no admin SELECT policy. Postgres requires a post-UPDATE row
--      to remain visible under SELECT policies when the UPDATE reads the table,
--      so an admin setting someone else's event to 'cancelled' (making it
--      invisible to them) raised 42501.
--
-- Public listings are unaffected: they either use the anon client or filter
-- status = 'published' explicitly.

CREATE POLICY "series_update_admin" ON event_series
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "events_select_admin" ON events
  FOR SELECT
  USING (is_admin());

-- event_series SELECT is otherwise "status = 'active'" or creator-only, which
-- would re-trigger the invisible-new-row error the moment an admin sets a
-- series to 'cancelled'.
CREATE POLICY "series_select_admin" ON event_series
  FOR SELECT
  USING (is_admin());
