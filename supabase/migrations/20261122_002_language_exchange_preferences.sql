BEGIN;
CREATE TABLE public.language_exchange_preferences (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 practice_language text NOT NULL CHECK (practice_language IN ('english','vietnamese','both')),
 english_level text NOT NULL CHECK (english_level IN ('starting','some','comfortable','advanced','fluent','native')),
 vietnamese_level text NOT NULL CHECK (vietnamese_level IN ('starting','some','comfortable','advanced','fluent','native')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.language_exchange_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.language_exchange_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.language_exchange_preferences TO service_role;
ALTER TABLE public.event_arrival_participants DROP CONSTRAINT event_arrival_participants_english_level_check,
 DROP CONSTRAINT event_arrival_participants_vietnamese_level_check,
 ADD CONSTRAINT event_arrival_participants_english_level_check CHECK (english_level IN ('starting','some','comfortable','advanced','fluent','native')),
 ADD CONSTRAINT event_arrival_participants_vietnamese_level_check CHECK (vietnamese_level IN ('starting','some','comfortable','advanced','fluent','native'));
CREATE OR REPLACE FUNCTION public.arrival_submit(p_event_id uuid,p_actor_id uuid,p_token_hash text,p_request_id uuid,p_payload jsonb) RETURNS jsonb
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
 IF (p_payload->>'englishLevel') IS NOT NULL AND p_payload->>'englishLevel' NOT IN ('starting','some','comfortable','advanced','fluent','native') OR
 (p_payload->>'vietnameseLevel') IS NOT NULL AND p_payload->>'vietnameseLevel' NOT IN ('starting','some','comfortable','advanced','fluent','native') THEN RAISE EXCEPTION 'invalid_level' USING ERRCODE='22023'; END IF;
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


CREATE OR REPLACE FUNCTION public.complete_signup_intent(p_id uuid,p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i signup_intents%ROWTYPE; t tribes%ROWTYPE; v_result jsonb; joined jsonb; rsvp jsonb; user_created timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM signup_intents WHERE id=p_id AND token_hash=p_token_hash FOR UPDATE;
 IF NOT FOUND OR i.expires_at<=now() OR (i.completed_by IS NOT NULL AND i.completed_by<>auth.uid()) THEN RAISE EXCEPTION 'Invalid continuation' USING ERRCODE='42501'; END IF;
 IF i.result IS NOT NULL THEN RETURN i.result; END IF;
 v_result:=jsonb_build_object('next_path',i.next_path);
 IF i.community_id IS NOT NULL THEN SELECT * INTO t FROM tribes WHERE id=i.community_id; END IF;
 IF i.kind='event' THEN
  IF i.event_action='interested' THEN
   rsvp:=mark_interested(i.target_id);
   v_result:=v_result||jsonb_build_object('rsvp_status','interested');
  ELSIF EXISTS(SELECT 1 FROM events e WHERE e.id=i.target_id AND e.arrival_enabled) OR EXISTS(SELECT 1 FROM event_questionnaires q JOIN event_questions eq ON eq.questionnaire_id=q.id WHERE q.event_id=i.target_id AND q.is_enabled) THEN
   v_result:=v_result||jsonb_build_object('rsvp_pending',true);
  ELSE
   rsvp:=rsvp_event(i.target_id,0);
   v_result:=v_result||jsonb_build_object('rsvp_status',rsvp->>'status');
  END IF;
 END IF;
 IF i.join_community AND t.id IS NOT NULL THEN
  BEGIN
   joined:=join_community(t.slug,i.invite_code,NULL);
   v_result:=v_result||jsonb_build_object('community_status',joined->>'status');
  EXCEPTION WHEN OTHERS THEN
   -- Account creation and RSVP remain valid when a community became unavailable.
   v_result:=v_result||jsonb_build_object('community_status','failed');
  END;
 END IF;
 SELECT created_at INTO user_created FROM auth.users WHERE id=auth.uid();
 IF user_created>=i.created_at AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_ghost) THEN
  BEGIN
  INSERT INTO account_acquisitions(user_id,source_kind,source_id,community_id,inviter_id,owner_at_signup,captured_at)
   VALUES(auth.uid(),i.kind,i.target_id,t.id,CASE WHEN i.inviter_id<>auth.uid() THEN i.inviter_id END,t.created_by,i.created_at)
   ON CONFLICT(user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'Account acquisition recording failed: %', SQLSTATE;
  END;
 END IF;
 IF i.visit_id IS NOT NULL AND t.id IS NOT NULL AND joined->>'status'='joined' THEN PERFORM complete_community_visit(i.visit_id,t.id); END IF;
 UPDATE signup_intents SET completed_by=auth.uid(),result=v_result,invite_code=NULL WHERE id=i.id;
 RETURN v_result||jsonb_build_object('just_completed',true,'event_id',CASE WHEN i.kind='event' THEN i.target_id END);
END $$;

COMMIT;
