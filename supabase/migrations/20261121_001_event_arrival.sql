-- Private event arrival workspace. All actor IDs and guest hashes must be verified
-- by the server; these RPCs are deliberately unavailable to browser roles.
BEGIN;
CREATE TABLE public.event_arrival_participants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
 user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
 token_hash text CHECK(token_hash IS NULL OR token_hash ~ '^[a-f0-9]{64}$'),
 nickname text NOT NULL CHECK(char_length(nickname) BETWEEN 1 AND 80),
 practice_language text NOT NULL CHECK(practice_language IN ('english','vietnamese','both')),
 english_level text CHECK(english_level IN ('starting','some','comfortable')),
 vietnamese_level text CHECK(vietnamese_level IN ('starting','some','comfortable')),
 checked_in_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(user_id IS NOT NULL OR token_hash IS NOT NULL),
 UNIQUE(event_id,user_id), UNIQUE(event_id,token_hash), UNIQUE(id,event_id)
);
CREATE TABLE public.event_staff (
 event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('welcome','orders','manager')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,user_id)
);
CREATE TABLE public.event_arrival_requests (
 event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 identity_key text NOT NULL,
 payload_hash text NOT NULL,
 receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,request_id)
);
ALTER TABLE public.event_arrival_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_arrival_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_arrival_participants, public.event_staff, public.event_arrival_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.event_arrival_participants TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.event_staff TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.event_arrival_requests TO service_role;
ALTER TABLE public.event_preorders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.event_preorders
 ADD COLUMN participant_id uuid,
 ADD COLUMN request_id uuid,
 ADD COLUMN paid_at timestamptz,
 ADD COLUMN paid_by uuid REFERENCES public.profiles(id),
 ADD CONSTRAINT event_preorders_participant_event_fk FOREIGN KEY(participant_id,event_id)
 REFERENCES public.event_arrival_participants(id,event_id),
 ADD CONSTRAINT event_preorders_identity CHECK(user_id IS NOT NULL OR participant_id IS NOT NULL);
CREATE UNIQUE INDEX event_preorders_one_live_participant ON public.event_preorders(participant_id)
 WHERE participant_id IS NOT NULL AND status IN ('pending','confirmed');
CREATE UNIQUE INDEX event_preorders_arrival_request ON public.event_preorders(event_id,request_id) WHERE request_id IS NOT NULL;

CREATE FUNCTION public.arrival_access(p_event_id uuid,p_actor_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH access AS (
 SELECT EXISTS(SELECT 1 FROM events e WHERE e.id=p_event_id AND p_actor_id IS NOT NULL AND (
 e.created_by=p_actor_id OR EXISTS(SELECT 1 FROM profiles p WHERE p.id=p_actor_id AND p.role IN ('admin','superadmin'))
 OR EXISTS(SELECT 1 FROM venues v WHERE v.id=e.venue_id AND v.owner_id=p_actor_id)
 OR EXISTS(SELECT 1 FROM venue_managers m WHERE m.venue_id=e.venue_id AND m.profile_id=p_actor_id AND m.accepted_at IS NOT NULL AND m.role IN ('owner','editor'))
 OR EXISTS(SELECT 1 FROM profiles p WHERE p.id=p_actor_id AND p.role='moderator' AND e.venue_id IS NOT NULL)
 )) OR EXISTS(SELECT 1 FROM event_staff WHERE event_id=p_event_id AND user_id=p_actor_id AND role='manager') AS manager,
 EXISTS(SELECT 1 FROM event_staff WHERE event_id=p_event_id AND user_id=p_actor_id AND role='welcome') AS welcome,
 EXISTS(SELECT 1 FROM event_staff WHERE event_id=p_event_id AND user_id=p_actor_id AND role='orders') AS orders
 ) SELECT jsonb_build_object('canWelcome',manager OR welcome OR orders,'canOrder',manager OR orders,'canManage',manager) FROM access;
$$;

-- Explicit receipt fields: never return a guest token/hash or private profile data.
CREATE FUNCTION public.arrival_receipt(p_participant_id uuid,p_order_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('participant',(
 SELECT jsonb_build_object('id',p.id,'event_id',p.event_id,'user_id',p.user_id,'nickname',p.nickname,
 'practice_language',p.practice_language,'english_level',p.english_level,'vietnamese_level',p.vietnamese_level,'checked_in_at',p.checked_in_at)
 FROM event_arrival_participants p WHERE p.id=p_participant_id),
 'order',(SELECT to_jsonb(o)||jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM event_preorder_items i WHERE i.preorder_id=o.id),'[]'::jsonb))
 FROM event_preorders o WHERE o.id=p_order_id));
$$;
REVOKE ALL ON FUNCTION public.arrival_receipt(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.arrival_submit(p_event_id uuid,p_actor_id uuid,p_token_hash text,p_request_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_event events%ROWTYPE; v_part event_arrival_participants%ROWTYPE;
 v_order event_preorders%ROWTYPE; v_request event_arrival_requests%ROWTYPE;
 v_access jsonb; v_items jsonb; v_identity text; v_hash text;
 v_staff boolean; v_user uuid; v_target uuid; v_name text; v_language text;
 v_total integer:=0; v_count integer; v_receipt jsonb; r record;
BEGIN
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 v_staff:=COALESCE((p_payload->>'staffEntry')::boolean,false);
 v_access:=arrival_access(p_event_id,p_actor_id);
 IF v_staff AND NOT (v_access->>'canWelcome')::boolean THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_actor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_token_hash IS NOT NULL AND p_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_token' USING ERRCODE='22023'; END IF;
 v_user:=CASE WHEN v_staff THEN NULLIF(p_payload->>'userId','')::uuid ELSE p_actor_id END;
 v_target:=CASE WHEN v_staff THEN NULLIF(p_payload->>'participantId','')::uuid END;
 IF NOT v_staff AND (p_payload ? 'userId' OR p_payload ? 'participantId') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF v_user IS NULL AND v_target IS NULL AND p_token_hash IS NULL THEN RAISE EXCEPTION 'invalid_identity' USING ERRCODE='22023'; END IF;
 v_identity:=COALESCE(p_actor_id::text,'guest:'||p_token_hash)||CASE WHEN v_staff THEN ':staff' ELSE '' END;
 v_hash:=md5(p_payload::text||COALESCE(p_token_hash,''));
 -- Serialize retries before testing the request ledger, then serialize participant writes.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text||p_request_id::text,0));
 SELECT * INTO v_request FROM event_arrival_requests WHERE event_id=p_event_id AND request_id=p_request_id;
 IF FOUND THEN
  IF v_request.identity_key<>v_identity OR v_request.payload_hash<>v_hash THEN RAISE EXCEPTION 'request_conflict' USING ERRCODE='40001'; END IF;
  RETURN v_request.receipt;
 END IF;
 SELECT * INTO v_event FROM events WHERE id=p_event_id AND status='published' AND (tribe_id IS NULL OR tribe_visibility='public') FOR SHARE;
 IF NOT FOUND OR v_event.starts_at IS NULL OR now()<v_event.starts_at-interval '6 hours' OR now()>COALESCE(v_event.ends_at,v_event.starts_at+interval '6 hours')+interval '2 hours' THEN
 RAISE EXCEPTION 'event_not_open_for_arrival' USING ERRCODE='22023'; END IF;
 IF v_staff AND v_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM rsvps WHERE event_id=p_event_id AND user_id=v_user AND status='going') THEN
 RAISE EXCEPTION 'rsvp_not_found' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text||COALESCE(v_target::text,v_user::text,p_token_hash),1));
 IF v_target IS NOT NULL THEN
  SELECT * INTO v_part FROM event_arrival_participants WHERE id=v_target AND event_id=p_event_id FOR UPDATE;
  IF NOT FOUND OR (v_user IS NOT NULL AND v_user IS DISTINCT FROM v_part.user_id) THEN RAISE EXCEPTION 'participant_not_found' USING ERRCODE='22023'; END IF;
  v_user:=v_part.user_id;
 ELSIF v_user IS NOT NULL THEN
  SELECT * INTO v_part FROM event_arrival_participants WHERE event_id=p_event_id AND user_id=v_user FOR UPDATE;
 ELSE
  SELECT * INTO v_part FROM event_arrival_participants WHERE event_id=p_event_id AND token_hash=p_token_hash FOR UPDATE;
 END IF;
 v_name:=btrim(COALESCE(p_payload->>'nickname',v_part.nickname,''));
 v_language:=COALESCE(p_payload->>'practiceLanguage',v_part.practice_language);
 IF char_length(v_name) NOT BETWEEN 1 AND 80 OR v_language IS NULL OR v_language NOT IN ('english','vietnamese','both') THEN RAISE EXCEPTION 'invalid_profile' USING ERRCODE='22023'; END IF;
 IF (p_payload->>'englishLevel') IS NOT NULL AND p_payload->>'englishLevel' NOT IN ('starting','some','comfortable') OR
 (p_payload->>'vietnameseLevel') IS NOT NULL AND p_payload->>'vietnameseLevel' NOT IN ('starting','some','comfortable') THEN RAISE EXCEPTION 'invalid_level' USING ERRCODE='22023'; END IF;
 v_items:=COALESCE(p_payload->'items','[]'::jsonb);
 IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' OR jsonb_array_length(v_items)>30 OR char_length(COALESCE(p_payload->>'note',''))>500 THEN RAISE EXCEPTION 'invalid_items' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(v_items)>0 THEN
  IF v_staff AND NOT (v_access->>'canOrder')::boolean THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM venues WHERE id=v_event.venue_id AND preorder_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'preorder_disabled' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_items) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object' OR COALESCE(x->>'qty','') !~ '^[0-9]{1,2}$' OR (x->>'qty')::integer NOT BETWEEN 1 AND 20) THEN RAISE EXCEPTION 'invalid_items' USING ERRCODE='22023'; END IF;
  PERFORM i.id FROM jsonb_array_elements(v_items) x
  JOIN venue_menu_items i ON i.id=(x->>'item_id')::uuid JOIN venue_menu_sections s ON s.id=i.section_id
  WHERE i.venue_id=v_event.venue_id FOR SHARE OF i,s;
  SELECT count(*) INTO v_count FROM jsonb_array_elements(v_items) x
  JOIN venue_menu_items i ON i.id=(x->>'item_id')::uuid JOIN venue_menu_sections s ON s.id=i.section_id
  WHERE i.venue_id=v_event.venue_id AND i.is_available AND NOT i.is_sold_out AND s.is_visible;
  IF v_count<>jsonb_array_length(v_items) OR (SELECT count(DISTINCT x->>'item_id') FROM jsonb_array_elements(v_items) x)<>v_count THEN RAISE EXCEPTION 'item_unavailable' USING ERRCODE='22023'; END IF;
 END IF;
 IF v_part.id IS NULL THEN
  INSERT INTO event_arrival_participants(event_id,user_id,token_hash,nickname,practice_language,english_level,vietnamese_level)
  VALUES(p_event_id,v_user,CASE WHEN v_user IS NULL THEN p_token_hash END,v_name,v_language,p_payload->>'englishLevel',p_payload->>'vietnameseLevel') RETURNING * INTO v_part;
 ELSE
  UPDATE event_arrival_participants SET nickname=v_name,practice_language=v_language,
  english_level=COALESCE(p_payload->>'englishLevel',english_level),vietnamese_level=COALESCE(p_payload->>'vietnameseLevel',vietnamese_level)
  WHERE id=v_part.id RETURNING * INTO v_part;
 END IF;
 IF v_user IS NOT NULL THEN
  UPDATE rsvps SET checked_in_at=COALESCE(checked_in_at,now()),checked_in_by=CASE WHEN v_staff THEN p_actor_id ELSE v_user END,no_show_at=NULL
  WHERE event_id=p_event_id AND user_id=v_user AND status='going';
 END IF;
 SELECT * INTO v_order FROM event_preorders WHERE event_id=p_event_id AND status IN ('pending','confirmed')
 AND (participant_id=v_part.id OR (v_user IS NOT NULL AND user_id=v_user)) FOR UPDATE;
 IF FOUND THEN
  IF jsonb_array_length(v_items)>0 AND (
   SELECT COALESCE(jsonb_agg(jsonb_build_object('item_id',menu_item_id,'qty',qty) ORDER BY menu_item_id),'[]'::jsonb) FROM event_preorder_items WHERE preorder_id=v_order.id
  ) IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('item_id',(x->>'item_id')::uuid,'qty',(x->>'qty')::integer) ORDER BY (x->>'item_id')::uuid) FROM jsonb_array_elements(v_items) x) THEN
   RAISE EXCEPTION 'existing_order' USING ERRCODE='40001';
  END IF;
  UPDATE event_preorders SET participant_id=v_part.id WHERE id=v_order.id RETURNING * INTO v_order;
 ELSIF jsonb_array_length(v_items)>0 THEN
  INSERT INTO event_preorders(event_id,venue_id,user_id,participant_id,request_id,note)
  VALUES(p_event_id,v_event.venue_id,v_user,v_part.id,p_request_id,NULLIF(btrim(p_payload->>'note'),'')) RETURNING * INTO v_order;
  FOR r IN SELECT i.id,i.name,i.price_vnd,(x->>'qty')::integer qty FROM jsonb_array_elements(v_items) x JOIN venue_menu_items i ON i.id=(x->>'item_id')::uuid LOOP
   INSERT INTO event_preorder_items(preorder_id,menu_item_id,name_snapshot,unit_price_vnd,qty) VALUES(v_order.id,r.id,r.name,r.price_vnd,r.qty);
   v_total:=v_total+r.price_vnd*r.qty;
  END LOOP;
  UPDATE event_preorders SET total_vnd=v_total WHERE id=v_order.id;
 END IF;
 v_receipt:=arrival_receipt(v_part.id,v_order.id);
 INSERT INTO event_arrival_requests(event_id,request_id,identity_key,payload_hash,receipt) VALUES(p_event_id,p_request_id,v_identity,v_hash,v_receipt);
 RETURN v_receipt;
END;
$$;

CREATE FUNCTION public.arrival_staff_action(p_event_id uuid,p_actor_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_access jsonb:=arrival_access(p_event_id,p_actor_id); v_action text:=p_payload->>'action';
 v_order event_preorders%ROWTYPE; v_status text; v_user uuid; v_role text; v_paid boolean;
BEGIN
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 IF v_action IN ('addStaff','removeStaff') THEN
  IF NOT (v_access->>'canManage')::boolean THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF v_action='addStaff' THEN
   v_role:=p_payload->>'role';
   IF v_role IS NULL OR v_role NOT IN ('welcome','orders','manager') THEN RAISE EXCEPTION 'invalid_role' USING ERRCODE='22023'; END IF;
   SELECT id INTO v_user FROM profiles WHERE username=btrim(p_payload->>'username');
   IF v_user IS NULL THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE='22023'; END IF;
   INSERT INTO event_staff(event_id,user_id,role) VALUES(p_event_id,v_user,v_role) ON CONFLICT(event_id,user_id) DO UPDATE SET role=excluded.role;
  ELSE
   DELETE FROM event_staff WHERE event_id=p_event_id AND user_id=(p_payload->>'userId')::uuid;
  END IF;
  RETURN jsonb_build_object('ok',true);
 ELSIF v_action IN ('setOrderStatus','setPaid') THEN
  IF NOT (v_access->>'canOrder')::boolean THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_order FROM event_preorders WHERE id=(p_payload->>'orderId')::uuid AND event_id=p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE='22023'; END IF;
  IF v_action='setOrderStatus' THEN
   v_status:=p_payload->>'status';
   IF v_status IS NULL OR v_status NOT IN ('pending','confirmed','fulfilled','cancelled') THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE='22023'; END IF;
   IF p_payload->>'expectedStatus' IS DISTINCT FROM v_order.status THEN RAISE EXCEPTION 'status_conflict' USING ERRCODE='40001'; END IF;
   IF v_status<>v_order.status AND NOT (v_order.status='pending' AND v_status IN ('confirmed','fulfilled','cancelled') OR v_order.status='confirmed' AND v_status IN ('fulfilled','cancelled')) THEN RAISE EXCEPTION 'invalid_transition' USING ERRCODE='22023'; END IF;
   UPDATE event_preorders SET status=v_status WHERE id=v_order.id RETURNING * INTO v_order;
  ELSE
   IF jsonb_typeof(p_payload->'paid') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid_paid' USING ERRCODE='22023'; END IF;
   v_paid:=(p_payload->>'paid')::boolean;
   UPDATE event_preorders SET paid_at=CASE WHEN v_paid THEN COALESCE(paid_at,now()) END,paid_by=CASE WHEN v_paid THEN COALESCE(paid_by,p_actor_id) END WHERE id=v_order.id RETURNING * INTO v_order;
  END IF;
  RETURN jsonb_build_object('ok',true,'order',to_jsonb(v_order));
 END IF;
 RAISE EXCEPTION 'invalid_action' USING ERRCODE='22023';
END;
$$;
REVOKE ALL ON FUNCTION public.arrival_access(uuid,uuid),public.arrival_submit(uuid,uuid,text,uuid,jsonb),public.arrival_staff_action(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arrival_access(uuid,uuid),public.arrival_submit(uuid,uuid,text,uuid,jsonb),public.arrival_staff_action(uuid,uuid,jsonb) TO service_role;
-- Hashed IP/event and guest/event buckets protect public intake against cookie churn.
CREATE TABLE public.event_arrival_rate_limits (
 key text PRIMARY KEY CHECK(key ~ '^[a-f0-9]{64}$'),
 started_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 1
);
ALTER TABLE public.event_arrival_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_arrival_rate_limits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.event_arrival_rate_limits TO service_role;
CREATE FUNCTION public.arrival_rate_limit(p_key text,p_limit integer DEFAULT 30) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_attempts integer;
BEGIN
 IF p_key IS NULL OR p_key !~ '^[a-f0-9]{64}$' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid_rate_limit' USING ERRCODE='22023'; END IF;
 INSERT INTO event_arrival_rate_limits(key) VALUES(p_key)
 ON CONFLICT(key) DO UPDATE SET
 started_at=CASE WHEN event_arrival_rate_limits.started_at<now()-interval '10 minutes' THEN now() ELSE event_arrival_rate_limits.started_at END,
 attempts=CASE WHEN event_arrival_rate_limits.started_at<now()-interval '10 minutes' THEN 1 ELSE LEAST(event_arrival_rate_limits.attempts+1,1001) END
 RETURNING attempts INTO v_attempts;
 RETURN v_attempts<=p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.arrival_rate_limit(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arrival_rate_limit(text,integer) TO service_role;
COMMIT;
