BEGIN;

CREATE SCHEMA IF NOT EXISTS rental_private;
GRANT USAGE ON SCHEMA rental_private TO authenticated;

CREATE TABLE public.rental_visit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.rental_visits(id) ON DELETE CASCADE,
  actor_id uuid DEFAULT auth.uid(),
  kind text NOT NULL DEFAULT 'message' CHECK (kind IN (
    'message','requested','proposed','confirmed','declined','cancelled','request_changed',
    'reschedule_proposed','rescheduled','reschedule_withdrawn','reschedule_kept','decline_reason'
  )),
  starts_at timestamptz,
  body text CONSTRAINT rental_event_body CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX rental_visit_events_history ON public.rental_visit_events(visit_id, recorded_at DESC, id DESC);
CREATE INDEX rental_visits_thread ON public.rental_visits(listing_id, renter_id, created_at DESC);

CREATE TABLE public.rental_reschedules (
  visit_id uuid PRIMARY KEY REFERENCES public.rental_visits(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  slot_id uuid REFERENCES public.rental_slots(id)
);

ALTER TABLE public.rental_visit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_reschedules ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.rental_visit_events, public.rental_reschedules TO authenticated;
GRANT INSERT (visit_id, body) ON TABLE public.rental_visit_events TO authenticated;

-- The visible visit is the authorization boundary for both participants.
CREATE POLICY rental_visit_event_participants ON public.rental_visit_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_visits v WHERE v.id = visit_id));
CREATE POLICY rental_visit_message_insert ON public.rental_visit_events FOR INSERT TO authenticated
  WITH CHECK (actor_id = (SELECT auth.uid()) AND kind = 'message' AND body IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.rental_visits v WHERE v.id = visit_id));
CREATE POLICY rental_reschedule_participants ON public.rental_reschedules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_visits v WHERE v.id = visit_id));

INSERT INTO public.rental_visit_events(visit_id, actor_id, kind, recorded_at)
SELECT id, renter_id, 'requested', created_at FROM public.rental_visits;

CREATE FUNCTION rental_private.record_visit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  event_kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_kind := CASE NEW.status WHEN 'proposed' THEN 'proposed' ELSE 'requested' END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    event_kind := NEW.status;
    IF NEW.status <> 'confirmed' THEN
      DELETE FROM public.rental_reschedules WHERE visit_id = NEW.id;
    END IF;
  ELSIF NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
    event_kind := CASE NEW.status
      WHEN 'confirmed' THEN 'rescheduled' WHEN 'pending' THEN 'request_changed' ELSE NEW.status
    END;
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO public.rental_visit_events(visit_id, actor_id, kind, starts_at)
    VALUES (NEW.id, auth.uid(), event_kind, NEW.starts_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER rental_visit_history AFTER INSERT OR UPDATE OF status, starts_at ON public.rental_visits
  FOR EACH ROW EXECUTE FUNCTION rental_private.record_visit();

-- Lock the same host slot as the existing request and availability paths.
CREATE FUNCTION rental_private.lock_reschedule_slot(owner_id uuid, requested_at timestamptz, open_slot uuid, visit uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  locked_slot uuid;
BEGIN
  IF open_slot IS NULL THEN
    INSERT INTO public.rental_slots(host_id, starts_at, is_open)
      VALUES (owner_id, requested_at, false) ON CONFLICT (host_id, starts_at) DO NOTHING;
  END IF;
  SELECT s.id INTO locked_slot FROM public.rental_slots s
    WHERE s.host_id = owner_id AND s.starts_at = requested_at
      AND (open_slot IS NULL OR (s.id = open_slot AND s.is_open))
    FOR UPDATE;
  IF locked_slot IS NULL OR EXISTS (
    SELECT 1 FROM public.rental_visits v JOIN public.rental_listings l ON l.id = v.listing_id
    WHERE l.host_id = owner_id AND v.id <> visit AND v.starts_at = requested_at
      AND v.status IN ('pending','proposed','confirmed')
  ) THEN RETURN NULL; END IF;
  RETURN locked_slot;
END;
$$;

CREATE FUNCTION rental_private.propose_reschedule(visit uuid, chosen_slot uuid, requested_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  booking record;
  alternative timestamptz := requested_at;
  locked_slot uuid;
BEGIN
  IF actor IS NULL THEN RETURN false; END IF;
  SELECT v.*, l.host_id INTO booking FROM public.rental_visits v JOIN public.rental_listings l ON l.id = v.listing_id
    WHERE v.id = visit AND l.status = 'published' AND actor IN (v.renter_id,l.host_id)
      AND (v.status = 'confirmed' OR (v.status = 'pending' AND v.renter_id = actor))
    FOR UPDATE OF v;
  IF NOT FOUND OR (booking.starts_at IS NOT NULL AND booking.starts_at <= now()) THEN RETURN false; END IF;
  IF actor = booking.renter_id THEN
    SELECT s.starts_at INTO alternative FROM public.rental_slots s
      WHERE s.id = chosen_slot AND s.host_id = booking.host_id AND s.is_open;
  ELSIF chosen_slot IS NOT NULL THEN
    RETURN false;
  END IF;
  IF alternative IS NULL OR alternative <= now() OR alternative IS NOT DISTINCT FROM booking.starts_at THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.rental_reschedules WHERE visit_id = visit AND starts_at > now()) THEN RETURN false; END IF;

  IF booking.status = 'pending' THEN
    locked_slot := rental_private.lock_reschedule_slot(booking.host_id, alternative, chosen_slot, visit);
    IF locked_slot IS NULL THEN RETURN false; END IF;
    UPDATE public.rental_visits SET starts_at = alternative, slot_id = locked_slot WHERE id = visit;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.rental_visits v JOIN public.rental_listings l ON l.id = v.listing_id
      WHERE l.host_id = booking.host_id AND v.starts_at = alternative AND v.status IN ('pending','proposed','confirmed')
    ) THEN RETURN false; END IF;
    INSERT INTO public.rental_reschedules(visit_id, proposed_by, starts_at, slot_id)
      VALUES (visit, actor, alternative, chosen_slot)
      ON CONFLICT (visit_id) DO UPDATE SET proposed_by = EXCLUDED.proposed_by, starts_at = EXCLUDED.starts_at, slot_id = EXCLUDED.slot_id;
    INSERT INTO public.rental_visit_events(visit_id, actor_id, kind, starts_at)
      VALUES (visit, actor, 'reschedule_proposed', alternative);
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION rental_private.answer_reschedule(visit uuid, decision text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  booking record;
  proposal public.rental_reschedules%ROWTYPE;
  locked_slot uuid;
BEGIN
  IF actor IS NULL OR decision IS NULL OR decision NOT IN ('accept','keep','withdraw') THEN RETURN false; END IF;
  SELECT v.*, l.host_id INTO booking FROM public.rental_visits v JOIN public.rental_listings l ON l.id = v.listing_id
    WHERE v.id = visit AND actor IN (v.renter_id,l.host_id) AND v.status = 'confirmed'
    FOR UPDATE OF v;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO proposal FROM public.rental_reschedules WHERE visit_id = visit;
  IF NOT FOUND OR ((decision = 'withdraw') <> (actor = proposal.proposed_by)) THEN RETURN false; END IF;

  IF decision = 'accept' THEN
    IF proposal.starts_at <= now() OR booking.starts_at <= now() THEN RETURN false; END IF;
    locked_slot := rental_private.lock_reschedule_slot(booking.host_id, proposal.starts_at, proposal.slot_id, visit);
    IF locked_slot IS NULL THEN RETURN false; END IF;
    UPDATE public.rental_visits SET starts_at = proposal.starts_at, slot_id = locked_slot WHERE id = visit;
  ELSE
    INSERT INTO public.rental_visit_events(visit_id, actor_id, kind, starts_at)
      VALUES (visit, actor, CASE decision WHEN 'withdraw' THEN 'reschedule_withdrawn' ELSE 'reschedule_kept' END, booking.starts_at);
  END IF;
  DELETE FROM public.rental_reschedules WHERE visit_id = visit;
  RETURN true;
END;
$$;

CREATE FUNCTION rental_private.decline_viewing(visit uuid, reason text, unlist boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF length(btrim(reason)) > 250 OR NOT public.rental_update_viewing(visit, 'declined', NULL) THEN RETURN false; END IF;
  IF unlist IS TRUE THEN
    UPDATE public.rental_listings l SET status = 'draft'
      FROM public.rental_visits v WHERE v.id = visit AND v.listing_id = l.id AND l.host_id = auth.uid();
  END IF;
  IF nullif(btrim(reason), '') IS NOT NULL THEN
    INSERT INTO public.rental_visit_events(visit_id, actor_id, kind, body)
      VALUES (visit, auth.uid(), 'decline_reason', btrim(reason));
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION rental_private.offer_replacement(visit uuid, requested_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  previous public.rental_visits%ROWTYPE;
  locked_slot uuid;
  replacement uuid;
BEGIN
  IF actor IS NULL OR requested_at IS NULL OR requested_at <= now() THEN RETURN NULL; END IF;
  SELECT v.* INTO previous FROM public.rental_visits v JOIN public.rental_listings l ON l.id = v.listing_id
    WHERE v.id = visit AND l.host_id = actor AND l.status = 'published'
      AND v.status IN ('cancelled','declined')
    FOR UPDATE OF v;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.rental_visits v WHERE v.listing_id = previous.listing_id AND v.renter_id = previous.renter_id
      AND v.status IN ('pending','proposed','confirmed')
  ) THEN RETURN NULL; END IF;

  locked_slot := rental_private.lock_reschedule_slot(actor, requested_at, NULL, visit);
  IF locked_slot IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.rental_visits(listing_id,renter_id,slot_id,starts_at,status)
    VALUES (previous.listing_id, previous.renter_id, locked_slot, requested_at, 'proposed')
    ON CONFLICT DO NOTHING RETURNING id INTO replacement;
  RETURN replacement;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA rental_private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rental_private.propose_reschedule(uuid,uuid,timestamptz),
  rental_private.answer_reschedule(uuid,text), rental_private.decline_viewing(uuid,text,boolean),
  rental_private.offer_replacement(uuid,timestamptz) TO authenticated;

CREATE FUNCTION public.rental_propose_reschedule(visit uuid, chosen_slot uuid, requested_at timestamptz)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT rental_private.propose_reschedule(visit, chosen_slot, requested_at);
$$;
CREATE FUNCTION public.rental_answer_reschedule(visit uuid, decision text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT rental_private.answer_reschedule(visit, decision);
$$;
CREATE FUNCTION public.rental_decline_viewing(visit uuid, reason text, unlist boolean)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT rental_private.decline_viewing(visit, reason, unlist);
$$;

CREATE FUNCTION public.rental_offer_replacement(visit uuid, requested_at timestamptz)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT rental_private.offer_replacement(visit, requested_at);
$$;

REVOKE ALL ON FUNCTION public.rental_propose_reschedule(uuid,uuid,timestamptz),
  public.rental_answer_reschedule(uuid,text), public.rental_decline_viewing(uuid,text,boolean),
  public.rental_offer_replacement(uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_propose_reschedule(uuid,uuid,timestamptz),
  public.rental_answer_reschedule(uuid,text), public.rental_decline_viewing(uuid,text,boolean),
  public.rental_offer_replacement(uuid,timestamptz) TO authenticated;

COMMIT;
