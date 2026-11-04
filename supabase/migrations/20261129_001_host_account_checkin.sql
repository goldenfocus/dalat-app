-- Private, event-scoped account lookup and atomic assisted registration/check-in.
BEGIN;
CREATE FUNCTION public.arrival_search_text(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public AS $$
 SELECT replace(regexp_replace(normalize(lower(coalesce(value,'')),NFD),U&'[\0300-\036f]','','g'),'đ','d');
$$;
REVOKE ALL ON FUNCTION public.arrival_search_text(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.arrival_search_accounts(p_event_id uuid,p_actor_id uuid,p_query text)
RETURNS TABLE(user_id uuid,username text,display_name text,avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE term text:=btrim(p_query); folded text;
BEGIN
 IF NOT coalesce((arrival_access(p_event_id,p_actor_id)->>'canWelcome')::boolean,false) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM events WHERE id=p_event_id AND status='published' AND arrival_enabled AND (tribe_id IS NULL OR tribe_visibility='public')) THEN
  RAISE EXCEPTION 'event_not_found' USING ERRCODE='22023';
 END IF;
 IF left(term,1)='@' THEN term:=substr(term,2); END IF;
 IF char_length(term) NOT BETWEEN 2 AND 200 THEN RETURN; END IF;
 folded:=arrival_search_text(term);
 RETURN QUERY
 SELECT p.id,p.username,p.display_name,p.avatar_url
 FROM profiles p JOIN auth.users u ON u.id=p.id
 WHERE NOT coalesce(p.is_ghost,false) AND (
  -- Email is an exact lookup only; it is never returned to the browser.
  lower(u.email)=lower(term) OR lower(p.username)=lower(term) OR
  (position('@' in term)=0 AND (coalesce(p.discoverable,true) OR EXISTS(
    SELECT 1 FROM rsvps r WHERE r.event_id=p_event_id AND r.user_id=p.id
   )) AND (position(folded in arrival_search_text(p.username))>0 OR position(folded in arrival_search_text(p.display_name))>0))
 )
 ORDER BY CASE WHEN lower(u.email)=lower(term) OR lower(p.username)=lower(term) THEN 0
  WHEN arrival_search_text(p.display_name)=folded THEN 1 ELSE 2 END,
  p.display_name NULLS LAST,p.username NULLS LAST,p.id
 LIMIT 10;
END; $$;
REVOKE ALL ON FUNCTION public.arrival_search_accounts(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arrival_search_accounts(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.arrival_staff_checkin(p_event_id uuid,p_actor_id uuid,p_token_hash text,p_request_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_user uuid:=nullif(p_payload->>'userId','')::uuid; event_row events%ROWTYPE; existing_rsvp rsvps%ROWTYPE;
BEGIN
 IF NOT coalesce((p_payload->>'staffEntry')::boolean,false)
 OR NOT coalesce((arrival_access(p_event_id,p_actor_id)->>'canWelcome')::boolean,false) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF target_user IS NULL OR p_payload ? 'participantId' OR NOT EXISTS(
  SELECT 1 FROM profiles WHERE id=target_user AND NOT coalesce(is_ghost,false)
 ) THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE='22023'; END IF;
 -- Use the existing request/participant lock order, and make a retry a no-op.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text||p_request_id::text,0));
 IF EXISTS(SELECT 1 FROM event_arrival_requests WHERE event_id=p_event_id AND request_id=p_request_id) THEN
  RETURN arrival_submit(p_event_id,p_actor_id,p_token_hash,p_request_id,p_payload);
 END IF;
 SELECT * INTO event_row FROM events WHERE id=p_event_id AND status='published' AND arrival_enabled
  AND (tribe_id IS NULL OR tribe_visibility='public') FOR UPDATE;
 IF NOT FOUND OR event_row.starts_at IS NULL OR now()<event_row.starts_at-interval '6 hours'
 OR now()>coalesce(event_row.ends_at,event_row.starts_at+interval '6 hours')+interval '2 hours' THEN
  RAISE EXCEPTION 'event_not_open_for_arrival' USING ERRCODE='22023';
 END IF;
 SELECT * INTO existing_rsvp FROM rsvps WHERE event_id=p_event_id AND user_id=target_user FOR UPDATE;
 IF existing_rsvp.id IS NULL OR existing_rsvp.status IS DISTINCT FROM 'going' THEN
  IF event_row.capacity IS NOT NULL AND (
   SELECT coalesce(sum(1+coalesce(plus_ones,0)),0) FROM rsvps WHERE event_id=p_event_id AND status='going'
  )+1+coalesce(existing_rsvp.plus_ones,0)>event_row.capacity THEN
   RAISE EXCEPTION 'event_full' USING ERRCODE='22023';
  END IF;
  IF existing_rsvp.id IS NULL THEN
   INSERT INTO rsvps(event_id,user_id,status) VALUES(p_event_id,target_user,'going');
  ELSE
   UPDATE rsvps SET status='going',created_at=now() WHERE id=existing_rsvp.id;
  END IF;
 END IF;
 -- Any validation/order failure rolls back the RSVP too. No invitations are sent.
 RETURN arrival_submit(p_event_id,p_actor_id,p_token_hash,p_request_id,p_payload);
END; $$;
REVOKE ALL ON FUNCTION public.arrival_staff_checkin(uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arrival_staff_checkin(uuid,uuid,text,uuid,jsonb) TO service_role;
COMMIT;
