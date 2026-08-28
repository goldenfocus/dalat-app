-- Activity Graph admin tombstones retain the moderator UUID, but these audit
-- columns must not create a second PostgREST relationship from events or
-- event_series to profiles. Existing public queries embed the creator as
-- `profiles(*)`; a second FK makes that relationship ambiguous and turns valid
-- event detail routes into 404s.

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_activity_admin_suppressed_by_fkey;

ALTER TABLE event_series
  DROP CONSTRAINT IF EXISTS event_series_activity_admin_suppressed_by_fkey;

COMMENT ON COLUMN events.activity_admin_suppressed_by IS
  'Moderator profile UUID recorded by the authoritative admin-unlist RPC; intentionally no FK to preserve the canonical events-to-creator PostgREST relationship.';

COMMENT ON COLUMN event_series.activity_admin_suppressed_by IS
  'Moderator profile UUID recorded by the authoritative admin-unlist RPC; intentionally no FK to preserve the canonical series-to-creator PostgREST relationship.';
