-- Creator auto-RSVP for ALL events, not just series occurrences.
--
-- 20260925_001 added the creator auto-RSVP block to
-- auto_rsvp_for_series_subscribers(), but the trigger that runs it was
-- still gated WHEN (NEW.series_id IS NOT NULL) — so for single events the
-- creator block was dead code. The client-side fallback
-- (`void supabase.rpc("rsvp_event", ...)` in event-form.tsx) never fired
-- either: supabase-js builders are lazy thenables and the request is only
-- sent on await/.then(), so `void` discarded it unsent.
--
-- Fix: re-create the trigger un-gated. The function body is NOT touched
-- (see 20260925_001: subscriber logic must stay byte-identical) — it
-- already guards series logic with IF NEW.series_id IS NOT NULL and skips
-- imported events via source_platform.

DROP TRIGGER IF EXISTS on_series_event_created ON events;

CREATE TRIGGER on_event_created_auto_rsvp
  AFTER INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION auto_rsvp_for_series_subscribers();

-- Backfill the gap since the 20260925 backfill ran (single events created
-- after it, e.g. poker-dalat-private-tournament-p5vo). Same guards as
-- 20260925: published, upcoming, non-imported, capacity headroom.
INSERT INTO rsvps (event_id, user_id, status, plus_ones)
SELECT e.id, e.created_by, 'going', 0
FROM events e
WHERE e.status = 'published'
  AND e.starts_at > now()
  AND e.created_by IS NOT NULL
  AND (e.source_platform IS NULL OR e.source_platform = 'manual')
  AND (e.capacity IS NULL OR
       (SELECT COALESCE(SUM(1 + r.plus_ones), 0) FROM rsvps r
         WHERE r.event_id = e.id AND r.status = 'going') < e.capacity)
ON CONFLICT (event_id, user_id) DO NOTHING;
