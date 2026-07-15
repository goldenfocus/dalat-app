-- ============================================
-- Linked Past Event (admin-set moments reference)
-- ============================================
-- A new event can showcase the published moments of a previous edition
-- (a different event row, possibly by a different creator) until it has
-- moments of its own. Display-only reference: moments stay owned by the
-- past event. Set/unset by admins via /api/admin/link-past-event.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS linked_past_event_id uuid REFERENCES events(id) ON DELETE SET NULL;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_linked_past_event_not_self;
ALTER TABLE events
  ADD CONSTRAINT events_linked_past_event_not_self
  CHECK (linked_past_event_id IS NULL OR linked_past_event_id <> id);

-- Speeds up the FK's ON DELETE SET NULL scan when a linked event is deleted
CREATE INDEX IF NOT EXISTS idx_events_linked_past_event
  ON events(linked_past_event_id)
  WHERE linked_past_event_id IS NOT NULL;

COMMENT ON COLUMN events.linked_past_event_id IS
  'Admin-set reference to a past event whose published moments are showcased on this event page until it has moments of its own.';
