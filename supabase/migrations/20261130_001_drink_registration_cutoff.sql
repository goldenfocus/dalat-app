-- A registration deadline is separate from the time a qualified guest can redeem.
BEGIN;
ALTER TABLE public.event_drink_sponsors ADD COLUMN registration_cutoff_at timestamptz;
ALTER TABLE public.series_drink_sponsors ADD COLUMN registration_cutoff_local_time time;
ALTER TABLE public.language_exchange_rsvp_positions ADD COLUMN registered_at timestamptz;
-- Historical rows predate the eligibility ledger timestamp. RSVP creation is the
-- available registration evidence; new Going transitions are recorded by trigger.
UPDATE public.language_exchange_rsvp_positions p SET registered_at=r.created_at
FROM public.rsvps r WHERE r.event_id=p.event_id AND r.user_id=p.user_id;
UPDATE public.language_exchange_rsvp_positions SET registered_at=now() WHERE registered_at IS NULL;
ALTER TABLE public.language_exchange_rsvp_positions ALTER COLUMN registered_at SET DEFAULT now();
ALTER TABLE public.language_exchange_rsvp_positions ALTER COLUMN registered_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_language_rsvp_positions(p_event_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE base integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text||':rsvp-position',3));
 SELECT COALESCE(max(position),0) INTO base FROM language_exchange_rsvp_positions WHERE event_id=p_event_id;
 INSERT INTO language_exchange_rsvp_positions(event_id,user_id,position,registered_at)
 SELECT p_event_id,r.user_id,base+row_number() OVER(ORDER BY r.created_at,r.id)::integer,r.created_at FROM rsvps r
 WHERE r.event_id=p_event_id AND r.status='going' AND NOT EXISTS(
 SELECT 1 FROM language_exchange_rsvp_positions p WHERE p.event_id=p_event_id AND p.user_id=r.user_id)
 ON CONFLICT(event_id,user_id) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.record_language_rsvp_position() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='going' AND EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id AND arrival_enabled) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id::text||':rsvp-position',3));
  INSERT INTO language_exchange_rsvp_positions(event_id,user_id,position,registered_at)
  SELECT NEW.event_id,NEW.user_id,COALESCE(max(position),0)+1,statement_timestamp()
  FROM language_exchange_rsvp_positions WHERE event_id=NEW.event_id
  ON CONFLICT(event_id,user_id) DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.arrival_sponsor_eligibility(p_event_id uuid,p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('eligible',COALESCE(
 p.position<=c.rsvp_limit AND c.ends_at>=now() AND r.status='going'
 AND (c.registration_cutoff_at IS NULL OR p.registered_at<c.registration_cutoff_at)
 AND NOT EXISTS(SELECT 1 FROM event_drink_redemptions d WHERE d.event_id=p_event_id AND d.user_id=p_user_id),false),
 'position',p.position,'limit',c.rsvp_limit,'cutoffAt',c.registration_cutoff_at,
 'registeredAt',p.registered_at,
 'claimed',EXISTS(SELECT 1 FROM event_drink_redemptions d WHERE d.event_id=p_event_id AND d.user_id=p_user_id))
 FROM (SELECT 1) x LEFT JOIN event_drink_sponsors c ON c.event_id=p_event_id
 LEFT JOIN language_exchange_rsvp_positions p ON p.event_id=p_event_id AND p.user_id=p_user_id
 LEFT JOIN rsvps r ON r.event_id=p_event_id AND r.user_id=p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.inherit_series_drink_offer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.arrival_enabled THEN
  INSERT INTO event_drink_sponsors(event_id,sponsor_name,ends_at,rsvp_limit,registration_cutoff_at)
  SELECT NEW.id,c.sponsor_name,COALESCE(NEW.ends_at,NEW.starts_at+interval '6 hours')+interval '2 hours',c.rsvp_limit,
   CASE WHEN c.registration_cutoff_local_time IS NOT NULL THEN
    ((NEW.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+c.registration_cutoff_local_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' END
  FROM series_drink_sponsors c WHERE c.series_id=NEW.series_id AND EXISTS(
   SELECT 1 FROM series_sponsored_drink_sections x JOIN venue_menu_sections s ON s.id=x.section_id WHERE x.series_id=c.series_id AND s.venue_id=NEW.venue_id)
  ON CONFLICT(event_id) DO UPDATE SET registration_cutoff_at=COALESCE(EXCLUDED.registration_cutoff_at,event_drink_sponsors.registration_cutoff_at);
  INSERT INTO event_sponsored_drinks(event_id,menu_item_id)
  SELECT NEW.id,i.id FROM series_sponsored_drink_sections s JOIN venue_menu_items i ON i.section_id=s.section_id
  JOIN event_drink_sponsors c ON c.event_id=NEW.id WHERE s.series_id=NEW.series_id AND i.venue_id=NEW.venue_id ON CONFLICT DO NOTHING;
  PERFORM ensure_language_rsvp_positions(NEW.id);
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER inherit_series_drink_offer ON public.events;
CREATE TRIGGER inherit_series_drink_offer AFTER INSERT OR UPDATE OF arrival_enabled,starts_at,series_id,venue_id ON public.events
 FOR EACH ROW EXECUTE FUNCTION public.inherit_series_drink_offer();

-- Only this authorized venue series adopts the 16:00 local registration rule.
UPDATE public.series_drink_sponsors SET registration_cutoff_local_time='16:00'
WHERE series_id=(SELECT id FROM public.event_series WHERE slug='language-exchange-social-house-z8oc');
UPDATE public.event_drink_sponsors c SET registration_cutoff_at=
 ((e.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+s.registration_cutoff_local_time) AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM public.events e JOIN public.series_drink_sponsors s ON s.series_id=e.series_id
WHERE c.event_id=e.id AND s.registration_cutoff_local_time IS NOT NULL AND c.ends_at>=now();

-- Void only unprepared, unpaid, entirely complimentary reservations created by
-- the old rule for late registrants. Never introduce a charge or rewrite item snapshots.
WITH cancelled AS (
UPDATE public.event_preorders o SET status='cancelled',sponsor_status='void'
FROM public.event_drink_sponsors c,public.language_exchange_rsvp_positions p
WHERE o.event_id=c.event_id AND p.event_id=o.event_id AND p.user_id=o.user_id
 AND c.registration_cutoff_at IS NOT NULL AND p.registered_at>=c.registration_cutoff_at
 AND o.status='pending' AND o.sponsor_status='reserved' AND o.is_reservation
 AND o.participant_id IS NULL AND o.paid_at IS NULL AND o.sponsored_vnd>0 AND o.total_vnd=o.sponsored_vnd
RETURNING o.*
)
UPDATE public.event_arrival_requests r SET receipt=jsonb_set(r.receipt,'{order}',
 COALESCE(r.receipt->'order','{}'::jsonb)||to_jsonb(o))
FROM cancelled o WHERE r.event_id=o.event_id AND r.receipt->'order'->>'id'=o.id::text;
COMMIT;
