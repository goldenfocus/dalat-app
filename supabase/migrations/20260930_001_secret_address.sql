-- Secret address: hide an event's exact location from the public and reveal
-- it only to the host and guests with RSVP status 'going' (plus admins).
-- Spec: docs/superpowers/specs/2026-07-09-secret-address-design.md
--
-- Architecture:
--   1. events.has_private_details flags the event.
--   2. event_private_details holds the real address/coords, RLS-gated, so the
--      anon REST API physically cannot read it.
--   3. A BEFORE trigger force-NULLs the public location columns whenever the
--      flag is on — no importer, geocode script, or future code path can
--      re-attach a public address to a secret event.
--   4. An AFTER trigger schedules the morning-of address reveal notification.
--      The guest roster is read at SEND time (in the Inngest processor), not
--      at schedule time, so waitlist promotions / cancellations / address
--      edits are all naturally handled.

-- 1. Flag on events
ALTER TABLE events ADD COLUMN IF NOT EXISTS has_private_details boolean NOT NULL DEFAULT false;

-- 2. Private details table
CREATE TABLE IF NOT EXISTS event_private_details (
  event_id uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  address text,
  google_maps_url text,
  latitude double precision,
  longitude double precision,
  arrival_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER event_private_details_updated_at
  BEFORE UPDATE ON event_private_details
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE event_private_details ENABLE ROW LEVEL SECURITY;

-- Read: admins, the event host, or guests who are going. Exactly 'going' —
-- waitlist / interested / cancelled must NOT see the address.
CREATE POLICY event_private_details_select ON event_private_details
FOR SELECT USING (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_private_details.event_id
      AND e.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM rsvps r
    WHERE r.event_id = event_private_details.event_id
      AND r.user_id = auth.uid()
      AND r.status = 'going'
  )
);

-- Write: admins or the event host only
CREATE POLICY event_private_details_insert ON event_private_details
FOR INSERT WITH CHECK (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_private_details.event_id
      AND e.created_by = auth.uid()
  )
);

CREATE POLICY event_private_details_update ON event_private_details
FOR UPDATE USING (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_private_details.event_id
      AND e.created_by = auth.uid()
  )
) WITH CHECK (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_private_details.event_id
      AND e.created_by = auth.uid()
  )
);

CREATE POLICY event_private_details_delete ON event_private_details
FOR DELETE USING (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_private_details.event_id
      AND e.created_by = auth.uid()
  )
);

-- 3. Write-side invariant: a secret event can never carry a public address.
-- This is the load-bearing guarantee — every feed, sitemap, OG image, JSON-LD
-- and map surface reads events.* and emits nothing when these are NULL.
CREATE OR REPLACE FUNCTION enforce_secret_address()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.has_private_details THEN
    NEW.address := NULL;
    NEW.google_maps_url := NULL;
    NEW.latitude := NULL;
    NEW.longitude := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_enforce_secret_address
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_secret_address();

-- 4. Morning-of address reveal notification type + scheduling
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_address_reveal';

-- One scheduled row PER EVENT (not per guest). The Inngest processor resolves
-- the going roster and the current address at send time. user_id is the host
-- (row ownership only — the host is excluded from the actual send).
-- Reveal time: 8am Đà Lạt on event day, but never later than 2h before start.
CREATE OR REPLACE FUNCTION schedule_address_reveal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reveal_at timestamptz;
BEGIN
  -- Only react when scheduling inputs change
  IF TG_OP = 'UPDATE'
     AND NEW.has_private_details = OLD.has_private_details
     AND NEW.starts_at = OLD.starts_at
     AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  UPDATE scheduled_notifications
  SET status = 'cancelled'
  WHERE reference_type = 'event_address_reveal'
    AND reference_id = NEW.id
    AND status = 'pending';

  IF NEW.has_private_details
     AND NEW.status = 'published'
     AND NEW.starts_at > now() THEN
    v_reveal_at := LEAST(
      (date_trunc('day', NEW.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '8 hours') AT TIME ZONE 'Asia/Ho_Chi_Minh',
      NEW.starts_at - interval '2 hours'
    );

    -- If the reveal moment already passed (event created day-of), skip the
    -- blast: guests see the address on the event page the moment they RSVP.
    IF v_reveal_at > now() THEN
      INSERT INTO scheduled_notifications (user_id, type, scheduled_for, payload, reference_type, reference_id)
      VALUES (
        NEW.created_by,
        'event_address_reveal',
        v_reveal_at,
        jsonb_build_object('type', 'event_address_reveal', 'eventId', NEW.id),
        'event_address_reveal',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_schedule_address_reveal
  AFTER INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION schedule_address_reveal();
