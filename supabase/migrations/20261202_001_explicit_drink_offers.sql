-- Event managers select exact complimentary items; menu-section changes must
-- never broaden an event-specific offer or rewrite already-promised receipts.
BEGIN;
ALTER TABLE public.event_drink_sponsors ADD COLUMN menu_override boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.set_event_drink_offer(p_event_id uuid,p_actor_id uuid,p_limit integer,p_item_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_venue uuid;
BEGIN
 IF NOT COALESCE((arrival_access(p_event_id,p_actor_id)->>'canManage')::boolean,false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 0 AND 100000 OR p_item_ids IS NULL OR cardinality(p_item_ids)>100 THEN RAISE EXCEPTION 'invalid_offer' USING ERRCODE='22023'; END IF;
 SELECT venue_id INTO target_venue FROM events WHERE id=p_event_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('drink-offer:'||target_venue::text,7));
 PERFORM 1 FROM event_drink_sponsors WHERE event_id=p_event_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_sponsor' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_item_ids) AS selected(item_id) WHERE NOT EXISTS(
  SELECT 1 FROM venue_menu_items i JOIN venue_menu_sections s ON s.id=i.section_id
  WHERE i.id=selected.item_id AND i.venue_id=target_venue )) THEN
  RAISE EXCEPTION 'item_unavailable' USING ERRCODE='22023';
 END IF;
 UPDATE event_drink_sponsors SET rsvp_limit=p_limit,menu_override=true WHERE event_id=p_event_id;
 DELETE FROM event_sponsored_drinks WHERE event_id=p_event_id;
 INSERT INTO event_sponsored_drinks(event_id,menu_item_id) SELECT p_event_id,id FROM unnest(p_item_ids) id ON CONFLICT DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.set_event_drink_offer(uuid,uuid,integer,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_drink_offer(uuid,uuid,integer,uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_event_sponsored_drink() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE venue_to_lock uuid;
BEGIN
 -- Lock a stable venue identity, including campaigns being created concurrently.
 FOR venue_to_lock IN SELECT DISTINCT id FROM unnest(ARRAY[NEW.venue_id,CASE WHEN TG_OP='UPDATE' THEN OLD.venue_id ELSE NEW.venue_id END]) id ORDER BY id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('drink-offer:'||venue_to_lock::text,7));
 END LOOP;
 -- Serialize menu-trigger sync with manager saves before checking menu_override.
 PERFORM c.event_id FROM event_drink_sponsors c JOIN events e ON e.id=c.event_id
 WHERE e.venue_id=NEW.venue_id ORDER BY c.event_id FOR UPDATE OF c;
 DELETE FROM event_sponsored_drinks d USING events e,series_drink_sponsors s,event_drink_sponsors c
 WHERE d.menu_item_id=NEW.id AND e.id=d.event_id AND s.series_id=e.series_id
 AND c.event_id=e.id AND NOT c.menu_override;
 INSERT INTO event_sponsored_drinks(event_id,menu_item_id)
 SELECT e.id,NEW.id FROM events e JOIN event_drink_sponsors c ON c.event_id=e.id
 JOIN series_sponsored_drink_sections s ON s.series_id=e.series_id AND s.section_id=NEW.section_id
 WHERE NOT c.menu_override AND c.ends_at>=now() AND e.venue_id=NEW.venue_id ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.inherit_series_drink_offer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('drink-offer:'||NEW.venue_id::text,7));
 PERFORM 1 FROM event_drink_sponsors WHERE event_id=NEW.id FOR UPDATE;
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
  JOIN event_drink_sponsors c ON c.event_id=NEW.id WHERE s.series_id=NEW.series_id AND i.venue_id=NEW.venue_id AND NOT c.menu_override ON CONFLICT DO NOTHING;
  PERFORM ensure_language_rsvp_positions(NEW.id);
 END IF;
 RETURN NEW;
END; $$;

COMMIT;
