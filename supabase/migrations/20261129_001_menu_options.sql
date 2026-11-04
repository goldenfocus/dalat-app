-- Verified ordering choices; prices and receipt labels are always resolved in SQL.
BEGIN;
ALTER TABLE public.venue_menu_items ADD COLUMN IF NOT EXISTS option_groups jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(option_groups)='array');
ALTER TABLE public.event_preorder_items ADD COLUMN IF NOT EXISTS selected_options jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(selected_options)='object');
CREATE OR REPLACE FUNCTION public.resolve_menu_options(p_item uuid, p_selected jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(name text,price_vnd integer,selected_options jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE item venue_menu_items%ROWTYPE; g jsonb; c jsonb; k text; label text;
BEGIN
 SELECT * INTO item FROM venue_menu_items WHERE id=p_item;
 IF NOT FOUND OR jsonb_typeof(p_selected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_options' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_selected) key WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item.option_groups) grp WHERE grp->>'id'=key)) THEN RAISE EXCEPTION 'invalid_options' USING ERRCODE='22023'; END IF;
 name:=item.name; price_vnd:=item.price_vnd; selected_options:=p_selected;
 FOR g IN SELECT * FROM jsonb_array_elements(item.option_groups) LOOP
  k:=p_selected->>(g->>'id');
  SELECT choice INTO c FROM jsonb_array_elements(g->'choices') choice WHERE choice->>'id'=k;
  IF c IS NULL THEN RAISE EXCEPTION 'invalid_options' USING ERRCODE='22023'; END IF;
  price_vnd:=price_vnd+(c->>'price_vnd')::integer;
  label:=CASE k WHEN 'hot' THEN 'Hot' WHEN 'iced' THEN 'Iced' WHEN 'standard' THEN 'Standard recipe' WHEN 'oat' THEN 'Oat milk' WHEN 'house' THEN 'House beans' WHEN 'wineRobusta' THEN 'Wine-fermented Robusta' WHEN 'chocolate' THEN 'Chocolate' WHEN 'matchaChocolate' THEN 'Matcha chocolate' WHEN 'kimchi' THEN 'Homemade kimchi' WHEN 'salad' THEN 'Salad' END;
  IF label IS NULL THEN RAISE EXCEPTION 'invalid_options' USING ERRCODE='22023'; END IF;
  name:=name||' · '||label;
 END LOOP;
 RETURN NEXT;
END; $$;
REVOKE ALL ON FUNCTION public.resolve_menu_options(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.arrival_submit_before_sponsor(p_event_id uuid,p_actor_id uuid,p_token_hash text,p_request_id uuid,p_payload jsonb) RETURNS jsonb
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
  IF v_count<>jsonb_array_length(v_items) OR (SELECT count(DISTINCT (x->>'item_id',COALESCE(x->'selected_options','{}'::jsonb))) FROM jsonb_array_elements(v_items) x)<>v_count THEN RAISE EXCEPTION 'item_unavailable' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM opt.price_vnd FROM jsonb_array_elements(v_items) x CROSS JOIN LATERAL resolve_menu_options((x->>'item_id')::uuid,COALESCE(x->'selected_options','{}'::jsonb)) opt;
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
   SELECT COALESCE(jsonb_agg(jsonb_build_object('item_id',menu_item_id,'qty',qty,'selected_options',selected_options) ORDER BY menu_item_id,selected_options::text),'[]'::jsonb) FROM event_preorder_items WHERE preorder_id=v_order.id
  ) IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('item_id',(x->>'item_id')::uuid,'qty',(x->>'qty')::integer,'selected_options',COALESCE(x->'selected_options','{}'::jsonb)) ORDER BY (x->>'item_id')::uuid,COALESCE(x->'selected_options','{}'::jsonb)::text) FROM jsonb_array_elements(v_items) x) THEN
   RAISE EXCEPTION 'existing_order' USING ERRCODE='40001';
  END IF;
  UPDATE event_preorders SET participant_id=v_part.id WHERE id=v_order.id RETURNING * INTO v_order;
 ELSIF jsonb_array_length(v_items)>0 THEN
  INSERT INTO event_preorders(event_id,venue_id,user_id,participant_id,request_id,note)
  VALUES(p_event_id,v_event.venue_id,v_user,v_part.id,p_request_id,NULLIF(btrim(p_payload->>'note'),'')) RETURNING * INTO v_order;
  FOR r IN SELECT i.id,opt.name,opt.price_vnd,opt.selected_options,(x->>'qty')::integer qty FROM jsonb_array_elements(v_items) x JOIN venue_menu_items i ON i.id=(x->>'item_id')::uuid CROSS JOIN LATERAL resolve_menu_options(i.id,COALESCE(x->'selected_options','{}'::jsonb)) opt LOOP
   INSERT INTO event_preorder_items(preorder_id,menu_item_id,name_snapshot,unit_price_vnd,qty,selected_options) VALUES(v_order.id,r.id,r.name,r.price_vnd,r.qty,r.selected_options);
   v_total:=v_total+r.price_vnd*r.qty;
  END LOOP;
  UPDATE event_preorders SET total_vnd=v_total WHERE id=v_order.id;
 END IF;
 v_receipt:=arrival_receipt(v_part.id,v_order.id);
 INSERT INTO event_arrival_requests(event_id,request_id,identity_key,payload_hash,receipt) VALUES(p_event_id,p_request_id,v_identity,v_hash,v_receipt);
 RETURN v_receipt;
END;
$$;
CREATE OR REPLACE FUNCTION public.arrival_reserve(p_event_id uuid,p_actor_id uuid,p_request_id uuid,p_payload jsonb) RETURNS jsonb
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
 IF count_items<>jsonb_array_length(items) OR (SELECT count(DISTINCT (x->>'item_id',COALESCE(x->'selected_options','{}'::jsonb))) FROM jsonb_array_elements(items) x)<>count_items THEN RAISE EXCEPTION 'item_unavailable' USING ERRCODE='22023'; END IF;
 PERFORM opt.price_vnd FROM jsonb_array_elements(items) x CROSS JOIN LATERAL resolve_menu_options((x->>'item_id')::uuid,COALESCE(x->'selected_options','{}'::jsonb)) opt;
 SELECT * INTO o FROM event_preorders WHERE event_id=p_event_id AND user_id=p_actor_id AND status IN ('pending','confirmed') FOR UPDATE;
 IF FOUND THEN
  IF (SELECT jsonb_agg(jsonb_build_object('item_id',menu_item_id,'qty',qty,'selected_options',selected_options) ORDER BY menu_item_id,selected_options::text) FROM event_preorder_items WHERE preorder_id=o.id)
  IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('item_id',(x->>'item_id')::uuid,'qty',(x->>'qty')::integer,'selected_options',COALESCE(x->'selected_options','{}'::jsonb)) ORDER BY (x->>'item_id')::uuid,COALESCE(x->'selected_options','{}'::jsonb)::text) FROM jsonb_array_elements(items) x) THEN RAISE EXCEPTION 'existing_order' USING ERRCODE='40001'; END IF;
 ELSE
  INSERT INTO event_preorders(event_id,venue_id,user_id,request_id,note,is_reservation,participant_id) VALUES(p_event_id,e.venue_id,p_actor_id,p_request_id,NULLIF(btrim(p_payload->>'note'),''),true,(SELECT id FROM event_arrival_participants WHERE event_id=p_event_id AND user_id=p_actor_id)) RETURNING * INTO o;
  FOR r IN SELECT i.id,opt.name,opt.price_vnd,opt.selected_options,(x->>'qty')::integer qty FROM jsonb_array_elements(items) x JOIN venue_menu_items i ON i.id=(x->>'item_id')::uuid CROSS JOIN LATERAL resolve_menu_options(i.id,COALESCE(x->'selected_options','{}'::jsonb)) opt LOOP
   INSERT INTO event_preorder_items(preorder_id,menu_item_id,name_snapshot,unit_price_vnd,qty,selected_options) VALUES(o.id,r.id,r.name,r.price_vnd,r.qty,r.selected_options);
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
create or replace function public.create_event_preorder(
  p_event_id uuid, p_items jsonb, p_note text default null, p_phone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_venue uuid;
  v_enabled boolean;
  v_preorder uuid;
  v_total integer := 0;
  v_count integer;
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'invalid_items';
  end if;

  select e.venue_id into v_venue from events e
   where e.id = p_event_id and e.status = 'published'
     and (e.tribe_id is null or e.tribe_visibility = 'public')
     and coalesce(e.ends_at, e.starts_at + interval '6 hours') > now();
  if v_venue is null then raise exception 'event_not_open_for_preorder'; end if;
  select preorder_enabled into v_enabled from venues where id = v_venue;
  if not coalesce(v_enabled, false) then raise exception 'preorder_disabled'; end if;

  select count(distinct i.id) into v_count
    from jsonb_array_elements(p_items) x
    join venue_menu_items i on i.id = (x->>'item_id')::uuid
   where i.venue_id = v_venue and i.is_available and not i.is_sold_out and exists(select 1 from venue_menu_sections s where s.id=i.section_id and s.is_visible);
  if v_count <> (select count(distinct x->>'item_id') from jsonb_array_elements(p_items) x) then
    raise exception 'item_unavailable';
  end if;

  if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) is distinct from 'object' or coalesce(x->>'qty','') !~ '^[0-9]{1,2}$' or (x->>'qty')::int not between 1 and 20) then raise exception 'invalid_items'; end if;
  perform opt.price_vnd from jsonb_array_elements(p_items) x cross join lateral resolve_menu_options((x->>'item_id')::uuid,coalesce(x->'selected_options','{}'::jsonb)) opt;

  -- replace any live preorder the guest already has for this event
  update event_preorders set status = 'cancelled'
   where event_id = p_event_id and user_id = v_uid and status in ('pending','confirmed');

  insert into event_preorders (event_id, venue_id, user_id, note, phone)
  values (p_event_id, v_venue, v_uid, nullif(left(trim(p_note), 500), ''), nullif(left(trim(p_phone), 40), ''))
  returning id into v_preorder;

  for r in
    select i.id, opt.name, opt.price_vnd, opt.selected_options, least(sum((x->>'qty')::int),20)::int as qty
      from jsonb_array_elements(p_items) x
      join venue_menu_items i on i.id = (x->>'item_id')::uuid
      cross join lateral resolve_menu_options(i.id,coalesce(x->'selected_options','{}'::jsonb)) opt
     where i.venue_id = v_venue
     group by i.id, opt.name, opt.price_vnd, opt.selected_options
  loop
    insert into event_preorder_items (preorder_id, menu_item_id, name_snapshot, unit_price_vnd, qty, selected_options)
    values (v_preorder, r.id, r.name, r.price_vnd, r.qty, r.selected_options);
    v_total := v_total + r.price_vnd * r.qty;
  end loop;

  update event_preorders set total_vnd = v_total where id = v_preorder;
  return v_preorder;
end;
$$;
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
 SELECT LEAST(i.unit_price_vnd,m.price_vnd) INTO amount FROM event_preorder_items i JOIN venue_menu_items m ON m.id=i.menu_item_id JOIN event_sponsored_drinks d
 ON d.event_id=o.event_id AND d.menu_item_id=i.menu_item_id
 WHERE i.preorder_id=o.id AND i.menu_item_id=p_item_id ORDER BY i.unit_price_vnd,i.id LIMIT 1;
 IF amount IS NULL THEN RAISE EXCEPTION 'invalid_sponsor_item' USING ERRCODE='22023'; END IF;
 INSERT INTO event_drink_redemptions(event_id,user_id,order_id) VALUES(o.event_id,p_user_id,o.id);
 UPDATE event_preorders SET sponsored_vnd=amount,sponsor_item_id=p_item_id,
 sponsor_status=CASE WHEN participant_id IS NOT NULL THEN 'owed' ELSE 'reserved' END WHERE id=o.id;
END;
$$;
COMMIT;
