-- Explicit two-event EZViet campaign. Menu prices remain unchanged.
-- data-api-grant: none public.event_drink_sponsors. Private service-role event configuration.
-- data-api-grant: none public.event_sponsored_drinks. Private service-role eligibility configuration.
-- data-api-grant: none public.event_drink_redemptions. Private benefit ledger.
BEGIN;
CREATE TABLE public.event_drink_sponsors (
 event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
 sponsor_name text NOT NULL CHECK(char_length(sponsor_name) BETWEEN 1 AND 100),
 ends_at timestamptz NOT NULL
);
CREATE TABLE public.event_sponsored_drinks (
 event_id uuid REFERENCES public.event_drink_sponsors(event_id) ON DELETE CASCADE,
 menu_item_id uuid REFERENCES public.venue_menu_items(id) ON DELETE CASCADE,
 PRIMARY KEY(event_id,menu_item_id)
);
-- This ledger survives order cancellation and RSVP changes: one benefit per person/event.
CREATE TABLE public.event_drink_redemptions (
 event_id uuid REFERENCES public.event_drink_sponsors(event_id) ON DELETE CASCADE,
 user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
 order_id uuid UNIQUE NOT NULL REFERENCES public.event_preorders(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,user_id)
);
ALTER TABLE public.event_drink_sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_sponsored_drinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_drink_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_drink_sponsors,public.event_sponsored_drinks,public.event_drink_redemptions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.event_drink_sponsors,public.event_sponsored_drinks,public.event_drink_redemptions TO service_role;
ALTER TABLE public.event_preorders
 ADD COLUMN is_reservation boolean NOT NULL DEFAULT false,
 ADD COLUMN sponsored_vnd integer NOT NULL DEFAULT 0 CHECK(sponsored_vnd>=0),
 ADD COLUMN guest_due_vnd integer GENERATED ALWAYS AS (total_vnd-sponsored_vnd) STORED,
 ADD COLUMN sponsor_item_id uuid REFERENCES public.venue_menu_items(id) ON DELETE SET NULL,
 ADD COLUMN sponsor_status text NOT NULL DEFAULT 'none' CHECK(sponsor_status IN ('none','reserved','owed','settled','void')),
 ADD COLUMN sponsor_settled_at timestamptz,
 ADD COLUMN sponsor_settled_by uuid REFERENCES public.profiles(id),
 ADD CONSTRAINT valid_sponsor_amount CHECK(sponsored_vnd<=total_vnd);
INSERT INTO event_drink_sponsors(event_id,sponsor_name,ends_at)
 SELECT id,'EZViet',COALESCE(ends_at,starts_at+interval '6 hours')+interval '2 hours' FROM events
 WHERE id IN ('171fa31b-4040-4ec3-a7cf-58e6f17dc096','f60d8b07-16d9-48be-ad3a-7483de51f914')
 AND venue_id='436f8b46-d5fe-41ef-8245-e8ffb9ee7980';
-- Audited live menu: these four sections contain all 16 listed drinks; remaining sections are food.
INSERT INTO event_sponsored_drinks(event_id,menu_item_id)
 SELECT c.event_id,i.id FROM event_drink_sponsors c JOIN events e ON e.id=c.event_id
 JOIN venue_menu_items i ON i.venue_id=e.venue_id JOIN venue_menu_sections s ON s.id=i.section_id
 WHERE s.id IN ('76b3fd76-595c-4584-82c0-0ebd248f8bc8','169bca59-4239-4b97-aa57-5c9e07bcc678','812e8788-475e-4304-a715-f67811359d6a','34357607-eb41-4436-99f0-b1ee5fcd04d0');

-- New drinks in the four audited beverage sections inherit the active offer.
-- Moving a product out of those sections removes eligibility, not past receipts.
CREATE FUNCTION public.sync_event_sponsored_drink() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 DELETE FROM event_sponsored_drinks d WHERE d.menu_item_id=NEW.id
 AND d.event_id IN ('171fa31b-4040-4ec3-a7cf-58e6f17dc096','f60d8b07-16d9-48be-ad3a-7483de51f914');
 IF NEW.venue_id='436f8b46-d5fe-41ef-8245-e8ffb9ee7980' AND NEW.section_id IN
 ('76b3fd76-595c-4584-82c0-0ebd248f8bc8','169bca59-4239-4b97-aa57-5c9e07bcc678','812e8788-475e-4304-a715-f67811359d6a','34357607-eb41-4436-99f0-b1ee5fcd04d0') THEN
  INSERT INTO event_sponsored_drinks(event_id,menu_item_id)
  SELECT c.event_id,NEW.id FROM event_drink_sponsors c JOIN events e ON e.id=c.event_id
  WHERE c.event_id IN ('171fa31b-4040-4ec3-a7cf-58e6f17dc096','f60d8b07-16d9-48be-ad3a-7483de51f914')
  AND c.ends_at>=now() AND e.venue_id=NEW.venue_id ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_event_sponsored_drink() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER sync_event_sponsored_drink AFTER INSERT OR UPDATE OF section_id,venue_id
 ON public.venue_menu_items FOR EACH ROW EXECUTE FUNCTION public.sync_event_sponsored_drink();

-- Private helper: requires the caller's actor/target to have been authenticated by the outer RPC.
CREATE FUNCTION public.arrival_apply_sponsor(p_order_id uuid,p_user_id uuid,p_item_id uuid) RETURNS void
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

-- Guard every status path, including the older venue preorder endpoints.
CREATE FUNCTION public.guard_sponsored_order() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.is_reservation AND NEW.participant_id IS NULL AND NEW.status IN ('confirmed','fulfilled') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'arrival_required' USING ERRCODE='22023'; END IF;
 IF NEW.sponsor_status<>'none' THEN
  IF NEW.status IN ('confirmed','fulfilled') AND NEW.status IS DISTINCT FROM OLD.status AND NEW.participant_id IS NULL THEN
   RAISE EXCEPTION 'arrival_required' USING ERRCODE='22023';
  END IF;
  IF NEW.status='cancelled' AND OLD.status<>'cancelled' AND OLD.sponsor_status<>'settled' THEN NEW.sponsor_status:='void'; END IF;
  IF OLD.status='cancelled' AND NEW.status<>'cancelled' THEN RAISE EXCEPTION 'invalid_transition' USING ERRCODE='22023'; END IF;
  IF NEW.participant_id IS NOT NULL AND NEW.sponsor_status='reserved' THEN
   IF NOT EXISTS(SELECT 1 FROM rsvps WHERE event_id=NEW.event_id AND user_id=NEW.user_id AND status='going') THEN RAISE EXCEPTION 'rsvp_not_found' USING ERRCODE='22023'; END IF;
   NEW.sponsor_status:='owed';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_sponsored_order() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_sponsored_order BEFORE UPDATE ON public.event_preorders FOR EACH ROW EXECUTE FUNCTION public.guard_sponsored_order();

ALTER FUNCTION public.arrival_submit(uuid,uuid,text,uuid,jsonb) RENAME TO arrival_submit_before_sponsor;
REVOKE ALL ON FUNCTION public.arrival_submit_before_sponsor(uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.arrival_submit(p_event_id uuid,p_actor_id uuid,p_token_hash text,p_request_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_receipt jsonb; item uuid:=NULLIF(p_payload->>'sponsoredItemId','')::uuid; order_id uuid; user_id uuid;
BEGIN
 IF item IS NOT NULL AND COALESCE((p_payload->>'staffEntry')::boolean,false) AND NOT (arrival_access(p_event_id,p_actor_id)->>'canOrder')::boolean THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 v_receipt:=arrival_submit_before_sponsor(p_event_id,p_actor_id,p_token_hash,p_request_id,p_payload);
 order_id:=(v_receipt->'order'->>'id')::uuid;
 user_id:=(v_receipt->'participant'->>'user_id')::uuid;
 IF item IS NOT NULL THEN
  PERFORM arrival_apply_sponsor(order_id,user_id,item);
 END IF;
 v_receipt:=arrival_receipt((v_receipt->'participant'->>'id')::uuid,order_id);
 UPDATE event_arrival_requests r SET receipt=arrival_receipt((v_receipt->'participant'->>'id')::uuid,order_id)
 WHERE r.event_id=p_event_id AND r.request_id=p_request_id;
 RETURN v_receipt;
END;
$$;

CREATE FUNCTION public.arrival_reserve(p_event_id uuid,p_actor_id uuid,p_request_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e events%ROWTYPE; o event_preorders%ROWTYPE; req event_arrival_requests%ROWTYPE;
 items jsonb:=p_payload->'items'; identity text:=p_actor_id::text||':reserve'; hash text:=md5(p_payload::text);
 total integer:=0; count_items integer; r record; result jsonb;
BEGIN
 IF p_actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='28000'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(items) IS DISTINCT FROM 'array'
 OR jsonb_array_length(items) NOT BETWEEN 1 AND 30 OR char_length(COALESCE(p_payload->>'note',''))>500 THEN RAISE EXCEPTION 'invalid_items' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text||p_request_id::text,0));
 SELECT * INTO req FROM event_arrival_requests WHERE event_id=p_event_id AND request_id=p_request_id;
 IF FOUND THEN
  IF req.identity_key<>identity OR req.payload_hash<>hash THEN RAISE EXCEPTION 'request_conflict' USING ERRCODE='40001'; END IF;
  RETURN req.receipt;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text||p_actor_id::text,1));
 SELECT * INTO e FROM events WHERE id=p_event_id AND arrival_enabled AND status='published' AND (tribe_id IS NULL OR tribe_visibility='public') FOR SHARE;
 IF NOT FOUND OR now()>COALESCE(e.ends_at,e.starts_at+interval '6 hours')+interval '2 hours' THEN RAISE EXCEPTION 'event_not_open_for_preorder' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM rsvps WHERE event_id=p_event_id AND user_id=p_actor_id AND status='going') THEN RAISE EXCEPTION 'rsvp_not_found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM venues WHERE id=e.venue_id AND preorder_enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'preorder_disabled' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object' OR COALESCE(x->>'qty','') !~ '^[0-9]{1,2}$' OR (x->>'qty')::integer NOT BETWEEN 1 AND 20) THEN RAISE EXCEPTION 'invalid_items' USING ERRCODE='22023'; END IF;
 PERFORM i.id FROM jsonb_array_elements(items) x JOIN venue_menu_items i ON i.id=(x->>'item_id')::uuid JOIN venue_menu_sections s ON s.id=i.section_id WHERE i.venue_id=e.venue_id FOR SHARE OF i,s;
 SELECT count(*) INTO count_items FROM jsonb_array_elements(items) x JOIN venue_menu_items i ON i.id=(x->>'item_id')::uuid JOIN venue_menu_sections s ON s.id=i.section_id WHERE i.venue_id=e.venue_id AND i.is_available AND NOT i.is_sold_out AND s.is_visible;
 IF count_items<>jsonb_array_length(items) OR (SELECT count(DISTINCT x->>'item_id') FROM jsonb_array_elements(items) x)<>count_items THEN RAISE EXCEPTION 'item_unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM event_preorders WHERE event_id=p_event_id AND user_id=p_actor_id AND status IN ('pending','confirmed') FOR UPDATE;
 IF FOUND THEN
  IF (SELECT jsonb_agg(jsonb_build_object('item_id',menu_item_id,'qty',qty) ORDER BY menu_item_id) FROM event_preorder_items WHERE preorder_id=o.id)
  IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('item_id',(x->>'item_id')::uuid,'qty',(x->>'qty')::integer) ORDER BY (x->>'item_id')::uuid) FROM jsonb_array_elements(items) x) THEN RAISE EXCEPTION 'existing_order' USING ERRCODE='40001'; END IF;
 ELSE
  INSERT INTO event_preorders(event_id,venue_id,user_id,request_id,note,is_reservation,participant_id) VALUES(p_event_id,e.venue_id,p_actor_id,p_request_id,NULLIF(btrim(p_payload->>'note'),''),true,(SELECT id FROM event_arrival_participants WHERE event_id=p_event_id AND user_id=p_actor_id)) RETURNING * INTO o;
  FOR r IN SELECT i.id,i.name,i.price_vnd,(x->>'qty')::integer qty FROM jsonb_array_elements(items) x JOIN venue_menu_items i ON i.id=(x->>'item_id')::uuid LOOP
   INSERT INTO event_preorder_items(preorder_id,menu_item_id,name_snapshot,unit_price_vnd,qty) VALUES(o.id,r.id,r.name,r.price_vnd,r.qty);
   total:=total+r.price_vnd*r.qty;
  END LOOP;
  UPDATE event_preorders SET total_vnd=total WHERE id=o.id;
 END IF;
 PERFORM arrival_apply_sponsor(o.id,p_actor_id,NULLIF(p_payload->>'sponsoredItemId','')::uuid);
 SELECT jsonb_build_object('order',to_jsonb(p)||jsonb_build_object('items',(SELECT jsonb_agg(to_jsonb(i)) FROM event_preorder_items i WHERE i.preorder_id=p.id))) INTO result FROM event_preorders p WHERE p.id=o.id;
 INSERT INTO event_arrival_requests(event_id,request_id,identity_key,payload_hash,receipt) VALUES(p_event_id,p_request_id,identity,hash,result);
 RETURN result;
END;
$$;

ALTER FUNCTION public.arrival_staff_action(uuid,uuid,jsonb) RENAME TO arrival_staff_action_before_sponsor;
REVOKE ALL ON FUNCTION public.arrival_staff_action_before_sponsor(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.arrival_staff_action(p_event_id uuid,p_actor_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o event_preorders%ROWTYPE;
BEGIN
 IF p_payload->>'action'<>'settleSponsor' THEN RETURN arrival_staff_action_before_sponsor(p_event_id,p_actor_id,p_payload); END IF;
 IF NOT (arrival_access(p_event_id,p_actor_id)->>'canManage')::boolean THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM event_preorders WHERE id=(p_payload->>'orderId')::uuid AND event_id=p_event_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE='22023'; END IF;
 IF o.sponsor_status='settled' THEN RETURN jsonb_build_object('ok',true,'order',to_jsonb(o)); END IF;
 IF o.sponsor_status<>'owed' OR o.status<>'fulfilled' THEN RAISE EXCEPTION 'invalid_settlement' USING ERRCODE='22023'; END IF;
 UPDATE event_preorders SET sponsor_status='settled',sponsor_settled_at=now(),sponsor_settled_by=p_actor_id WHERE id=o.id RETURNING * INTO o;
 RETURN jsonb_build_object('ok',true,'order',to_jsonb(o));
END;
$$;
REVOKE ALL ON FUNCTION public.arrival_submit(uuid,uuid,text,uuid,jsonb),public.arrival_reserve(uuid,uuid,uuid,jsonb),public.arrival_staff_action(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arrival_submit(uuid,uuid,text,uuid,jsonb),public.arrival_reserve(uuid,uuid,uuid,jsonb),public.arrival_staff_action(uuid,uuid,jsonb) TO service_role;
COMMIT;
