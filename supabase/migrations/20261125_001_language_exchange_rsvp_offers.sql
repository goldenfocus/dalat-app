-- A language-exchange tag selects the shared RSVP flow; offers remain explicit.
BEGIN;
ALTER TABLE public.event_drink_sponsors ADD COLUMN rsvp_limit integer NOT NULL DEFAULT 100 CHECK(rsvp_limit BETWEEN 0 AND 100000);
CREATE TABLE public.language_exchange_rsvp_positions (
 event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
 user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position>0),
 PRIMARY KEY(event_id,user_id), UNIQUE(event_id,position)
);
CREATE TABLE public.series_drink_sponsors (
 series_id uuid PRIMARY KEY REFERENCES public.event_series(id) ON DELETE CASCADE,
 sponsor_name text NOT NULL CHECK(char_length(sponsor_name) BETWEEN 1 AND 100),
 rsvp_limit integer NOT NULL DEFAULT 100 CHECK(rsvp_limit BETWEEN 0 AND 100000)
);
CREATE TABLE public.series_sponsored_drink_sections (
 series_id uuid REFERENCES public.series_drink_sponsors(series_id) ON DELETE CASCADE,
 section_id uuid REFERENCES public.venue_menu_sections(id) ON DELETE CASCADE,
 PRIMARY KEY(series_id,section_id)
);
ALTER TABLE public.language_exchange_rsvp_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_drink_sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_sponsored_drink_sections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.language_exchange_rsvp_positions,public.series_drink_sponsors,public.series_sponsored_drink_sections FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.language_exchange_rsvp_positions TO service_role;
GRANT ALL ON public.series_drink_sponsors TO service_role;
GRANT ALL ON public.series_sponsored_drink_sections TO service_role;

CREATE FUNCTION public.ensure_language_rsvp_positions(p_event_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE base integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text||':rsvp-position',3));
 SELECT COALESCE(max(position),0) INTO base FROM language_exchange_rsvp_positions WHERE event_id=p_event_id;
 INSERT INTO language_exchange_rsvp_positions(event_id,user_id,position)
 SELECT p_event_id,r.user_id,base+row_number() OVER(ORDER BY r.created_at,r.id)::integer FROM rsvps r
 WHERE r.event_id=p_event_id AND r.status='going' AND NOT EXISTS(
 SELECT 1 FROM language_exchange_rsvp_positions p WHERE p.event_id=p_event_id AND p.user_id=r.user_id)
 ON CONFLICT(event_id,user_id) DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_language_rsvp_positions(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.record_language_rsvp_position() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='going' AND EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id AND arrival_enabled) THEN
  PERFORM ensure_language_rsvp_positions(NEW.event_id);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.record_language_rsvp_position() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER record_language_rsvp_position AFTER INSERT OR UPDATE OF status ON public.rsvps
 FOR EACH ROW EXECUTE FUNCTION public.record_language_rsvp_position();

CREATE FUNCTION public.arrival_sponsor_eligibility(p_event_id uuid,p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('eligible',COALESCE(
 p.position<=c.rsvp_limit AND c.ends_at>=now() AND r.status='going' AND NOT EXISTS(SELECT 1 FROM event_drink_redemptions d WHERE d.event_id=p_event_id AND d.user_id=p_user_id),false),
 'position',p.position,'limit',c.rsvp_limit,'claimed',EXISTS(SELECT 1 FROM event_drink_redemptions d WHERE d.event_id=p_event_id AND d.user_id=p_user_id))
 FROM (SELECT 1) x LEFT JOIN event_drink_sponsors c ON c.event_id=p_event_id
 LEFT JOIN language_exchange_rsvp_positions p ON p.event_id=p_event_id AND p.user_id=p_user_id
 LEFT JOIN rsvps r ON r.event_id=p_event_id AND r.user_id=p_user_id;
$$;
REVOKE ALL ON FUNCTION public.arrival_sponsor_eligibility(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arrival_sponsor_eligibility(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.inherit_event_arrival_opt_in() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.arrival_enabled AND NOT NEW.arrival_enabled AND NEW.ai_tags IS NOT DISTINCT FROM OLD.ai_tags THEN
  NEW.ai_tags:=array_remove(NEW.ai_tags,'language-exchange'); RETURN NEW;
 END IF;
 IF 'language-exchange'=ANY(COALESCE(NEW.ai_tags,'{}')) THEN NEW.arrival_enabled:=true; END IF;
 IF TG_OP='INSERT' AND NEW.series_id IS NOT NULL AND NOT NEW.arrival_enabled THEN
  NEW.arrival_enabled:=COALESCE((SELECT arrival_enabled FROM event_series WHERE id=NEW.series_id),false);
 END IF;
 IF NEW.arrival_enabled AND NOT ('language-exchange'=ANY(COALESCE(NEW.ai_tags,'{}'))) THEN
  NEW.ai_tags:=array_append(COALESCE(NEW.ai_tags,'{}'),'language-exchange');
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER inherit_event_arrival_opt_in ON public.events;
CREATE TRIGGER inherit_event_arrival_opt_in BEFORE INSERT OR UPDATE OF ai_tags,arrival_enabled ON public.events
 FOR EACH ROW EXECUTE FUNCTION public.inherit_event_arrival_opt_in();

-- Carry the authorized Social House campaign and its audited beverage sections
-- into this series. A tag alone never promises another venue a sponsored drink.
INSERT INTO series_drink_sponsors(series_id,sponsor_name,rsvp_limit)
 SELECT DISTINCT e.series_id,c.sponsor_name,100 FROM events e JOIN event_drink_sponsors c ON c.event_id=e.id
 JOIN event_series s ON s.id=e.series_id WHERE s.slug='language-exchange-social-house-z8oc';
INSERT INTO series_sponsored_drink_sections(series_id,section_id)
 SELECT DISTINCT e.series_id,i.section_id FROM events e JOIN event_sponsored_drinks d ON d.event_id=e.id
 JOIN venue_menu_items i ON i.id=d.menu_item_id JOIN series_drink_sponsors c ON c.series_id=e.series_id;

CREATE FUNCTION public.inherit_series_drink_offer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.arrival_enabled THEN
  INSERT INTO event_drink_sponsors(event_id,sponsor_name,ends_at,rsvp_limit)
  SELECT NEW.id,c.sponsor_name,COALESCE(NEW.ends_at,NEW.starts_at+interval '6 hours')+interval '2 hours',c.rsvp_limit
  FROM series_drink_sponsors c WHERE c.series_id=NEW.series_id AND EXISTS(
   SELECT 1 FROM series_sponsored_drink_sections x JOIN venue_menu_sections s ON s.id=x.section_id WHERE x.series_id=c.series_id AND s.venue_id=NEW.venue_id)
  ON CONFLICT(event_id) DO NOTHING;
  INSERT INTO event_sponsored_drinks(event_id,menu_item_id)
  SELECT NEW.id,i.id FROM series_sponsored_drink_sections s JOIN venue_menu_items i ON i.section_id=s.section_id
  JOIN event_drink_sponsors c ON c.event_id=NEW.id WHERE s.series_id=NEW.series_id AND i.venue_id=NEW.venue_id ON CONFLICT DO NOTHING;
  PERFORM ensure_language_rsvp_positions(NEW.id);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.inherit_series_drink_offer() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER inherit_series_drink_offer AFTER INSERT OR UPDATE OF arrival_enabled ON public.events
 FOR EACH ROW EXECUTE FUNCTION public.inherit_series_drink_offer();
UPDATE events SET arrival_enabled=true WHERE arrival_enabled OR 'language-exchange'=ANY(COALESCE(ai_tags,'{}'));

CREATE OR REPLACE FUNCTION public.sync_event_sponsored_drink() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 DELETE FROM event_sponsored_drinks d USING events e,series_drink_sponsors c
 WHERE d.menu_item_id=NEW.id AND e.id=d.event_id AND c.series_id=e.series_id;
 INSERT INTO event_sponsored_drinks(event_id,menu_item_id)
 SELECT e.id,NEW.id FROM events e JOIN event_drink_sponsors c ON c.event_id=e.id
 JOIN series_sponsored_drink_sections s ON s.series_id=e.series_id AND s.section_id=NEW.section_id
 WHERE c.ends_at>=now() AND e.venue_id=NEW.venue_id ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.arrival_apply_sponsor(p_order_id uuid,p_user_id uuid,p_item_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o event_preorders%ROWTYPE; amount integer; previous_order uuid;
BEGIN
 IF p_item_id IS NULL THEN RETURN; END IF;
 SELECT * INTO o FROM event_preorders WHERE id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR p_user_id IS NULL OR o.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'invalid_sponsor' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(o.event_id::text||p_user_id::text,2));
 IF NOT EXISTS(SELECT 1 FROM event_drink_sponsors WHERE event_id=o.event_id AND ends_at>=now()) OR
 NOT EXISTS(SELECT 1 FROM rsvps WHERE event_id=o.event_id AND user_id=p_user_id AND status='going') THEN RAISE EXCEPTION 'invalid_sponsor' USING ERRCODE='22023'; END IF;
 SELECT order_id INTO previous_order FROM event_drink_redemptions WHERE event_id=o.event_id AND user_id=p_user_id;
 IF previous_order IS NOT NULL THEN
  IF previous_order=o.id AND o.sponsor_item_id=p_item_id THEN RETURN; END IF;
  RAISE EXCEPTION 'sponsor_already_used' USING ERRCODE='22023';
 END IF;
 IF NOT (arrival_sponsor_eligibility(o.event_id,p_user_id)->>'eligible')::boolean THEN RAISE EXCEPTION 'sponsor_limit_reached' USING ERRCODE='22023'; END IF;
 IF o.paid_at IS NOT NULL THEN RAISE EXCEPTION 'invalid_sponsor' USING ERRCODE='22023'; END IF;
 IF o.status NOT IN ('pending','confirmed') OR o.sponsor_status<>'none' THEN RAISE EXCEPTION 'invalid_sponsor' USING ERRCODE='22023'; END IF;
 SELECT i.unit_price_vnd INTO amount FROM event_preorder_items i JOIN event_sponsored_drinks d
 ON d.event_id=o.event_id AND d.menu_item_id=i.menu_item_id
 WHERE i.preorder_id=o.id AND i.menu_item_id=p_item_id;
 IF amount IS NULL THEN RAISE EXCEPTION 'invalid_sponsor_item' USING ERRCODE='22023'; END IF;
 INSERT INTO event_drink_redemptions(event_id,user_id,order_id) VALUES(o.event_id,p_user_id,o.id);
 UPDATE event_preorders SET sponsored_vnd=amount,sponsor_item_id=p_item_id,
 sponsor_status=CASE WHEN participant_id IS NOT NULL THEN 'owed' ELSE 'reserved' END WHERE id=o.id;
END;
$$;
REVOKE ALL ON FUNCTION public.arrival_apply_sponsor(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;


CREATE FUNCTION public.set_event_drink_limit(p_event_id uuid,p_actor_id uuid,p_limit integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (arrival_access(p_event_id,p_actor_id)->>'canManage')::boolean THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
 UPDATE event_drink_sponsors SET rsvp_limit=p_limit WHERE event_id=p_event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_sponsor' USING ERRCODE='22023'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.set_event_drink_limit(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_drink_limit(uuid,uuid,integer) TO service_role;
COMMIT;
