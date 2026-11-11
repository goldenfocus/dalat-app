-- Private member dating. No demo members, public preferences, or open messaging.
BEGIN;
CREATE SCHEMA IF NOT EXISTS dating_private;
REVOKE ALL ON SCHEMA dating_private FROM PUBLIC;
GRANT USAGE ON SCHEMA dating_private TO anon,authenticated;
LOCK TABLE public.profiles,public.unified_slugs,public.reserved_slugs IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.unified_slugs WHERE lower(slug)='dating')
 OR EXISTS(SELECT 1 FROM public.profiles WHERE lower(username)='dating') THEN
  RAISE EXCEPTION 'Dating route conflicts with an existing identity';
 END IF;
END $$;
INSERT INTO public.reserved_slugs(slug,reason) VALUES('dating','Route: /dating') ON CONFLICT DO NOTHING;
CREATE TABLE public.dating_profiles (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 birth_year integer NOT NULL CHECK(birth_year BETWEEN 1900 AND 2100),
 birth_date date,
 gender text NOT NULL CHECK(gender IN ('woman','man','nonbinary')),
 seeking text[] NOT NULL CHECK(cardinality(seeking) BETWEEN 1 AND 3 AND seeking <@ ARRAY['woman','man','nonbinary']::text[]),
 min_age integer NOT NULL CHECK(min_age BETWEEN 18 AND 100),
 max_age integer NOT NULL CHECK(max_age BETWEEN min_age AND 100),
 interests text[] NOT NULL DEFAULT '{}' CHECK(cardinality(interests)<=3 AND interests <@ ARRAY['coffee','walks','music']::text[]),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(birth_date IS NULL OR extract(year FROM birth_date)=birth_year)
);
CREATE TABLE public.dating_actions (
 actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 action text NOT NULL CHECK(action IN ('like','pass','block')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,target_id), CHECK(actor_id<>target_id)
);
CREATE INDEX dating_actions_target ON public.dating_actions(target_id,actor_id);
CREATE TABLE public.dating_activity_privacy (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 audience text NOT NULL DEFAULT 'only_me' CHECK(audience IN ('only_me','matches','members'))
);
CREATE TABLE public.dating_activity_blocks (
 owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 PRIMARY KEY(owner_id,viewer_id), CHECK(owner_id<>viewer_id)
);
CREATE TABLE public.dating_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), CHECK(sender_id<>recipient_id)
);
CREATE INDEX dating_messages_pair ON public.dating_messages(sender_id,recipient_id,created_at DESC);
CREATE TABLE public.dating_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(reason IN ('harassment','spam','impersonation','underage','other')),
 details text NOT NULL DEFAULT '' CHECK(char_length(details)<=1000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','suspended')),
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by uuid REFERENCES public.profiles(id),
 CHECK(reporter_id<>target_id)
);
CREATE UNIQUE INDEX dating_reports_one_open ON public.dating_reports(reporter_id,target_id) WHERE status='open';
CREATE TABLE public.dating_suspensions (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 staff_id uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.dating_limits (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 operation text NOT NULL, window_start timestamptz NOT NULL, count integer NOT NULL,
 PRIMARY KEY(user_id,operation)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['dating_profiles','dating_actions','dating_activity_privacy','dating_activity_blocks','dating_messages','dating_reports','dating_suspensions','dating_limits'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
-- data-api-grant: none public.dating_profiles. Private RPCs own all reads/writes.
-- data-api-grant: none public.dating_actions. Private RPCs own all reads/writes.
-- data-api-grant: none public.dating_activity_privacy. Private RPCs own all reads/writes.
-- data-api-grant: none public.dating_activity_blocks. Private RPCs own all reads/writes.
-- data-api-grant: none public.dating_messages. Private RPCs own all reads/writes.
-- data-api-grant: none public.dating_reports. Private staff RPCs own all reads/writes.
-- data-api-grant: none public.dating_suspensions. Private staff RPCs own all reads/writes.
-- data-api-grant: none public.dating_limits. Private rate limiter only.
CREATE FUNCTION public.dating_today() RETURNS date LANGUAGE sql STABLE AS $$
 SELECT timezone('Asia/Ho_Chi_Minh',now())::date;
$$;
CREATE FUNCTION public.dating_is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('superadmin','admin','moderator'));
$$;
CREATE FUNCTION public.dating_account_ready(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
 WHERE u.id=p_user AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)
 AND NOT coalesce(p.is_ghost,false) AND NOT p.is_private AND coalesce(nullif(btrim(p.display_name),''),nullif(p.username,'')) IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM public.dating_suspensions WHERE user_id=p_user);
$$;
CREATE FUNCTION public.dating_age_bounds(p public.dating_profiles) RETURNS integer[] LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN p.birth_date IS NOT NULL THEN ARRAY[extract(year FROM age(public.dating_today(),p.birth_date))::int,extract(year FROM age(public.dating_today(),p.birth_date))::int]
 ELSE ARRAY[extract(year FROM public.dating_today())::int-p.birth_year-1,extract(year FROM public.dating_today())::int-p.birth_year] END;
$$;
CREATE FUNCTION public.dating_lock_pair(p_a uuid,p_b uuid) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('dating:'||least(p_a,p_b)::text,0));
 IF p_a<>p_b THEN PERFORM pg_advisory_xact_lock(hashtextextended('dating:'||greatest(p_a,p_b)::text,0)); END IF;
END $$;
CREATE FUNCTION public.dating_throttle(p_operation text,p_limit integer,p_seconds integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 INSERT INTO public.dating_limits(user_id,operation,window_start,count) VALUES(auth.uid(),p_operation,clock_timestamp(),1)
 ON CONFLICT(user_id,operation) DO UPDATE SET
 count=CASE WHEN dating_limits.window_start<clock_timestamp()-make_interval(secs=>p_seconds) THEN 1 ELSE dating_limits.count+1 END,
 window_start=CASE WHEN dating_limits.window_start<clock_timestamp()-make_interval(secs=>p_seconds) THEN clock_timestamp() ELSE dating_limits.window_start END
 RETURNING count INTO n;
 IF n>p_limit THEN RAISE EXCEPTION 'rate_limited'; END IF;
END $$;
CREATE FUNCTION public.dating_pair_eligible(p_a uuid,p_b uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_a IS NOT NULL AND p_b IS NOT NULL AND p_a<>p_b
 AND public.dating_account_ready(p_a) AND public.dating_account_ready(p_b)
 AND EXISTS(SELECT 1 FROM public.dating_profiles a JOIN public.dating_profiles b ON b.user_id=p_b
 WHERE a.user_id=p_a AND a.enabled AND b.enabled
 AND (public.dating_age_bounds(a))[1]>=18 AND (public.dating_age_bounds(b))[1]>=18
 AND (public.dating_age_bounds(a))[1]>=b.min_age AND (public.dating_age_bounds(a))[2]<=b.max_age
 AND (public.dating_age_bounds(b))[1]>=a.min_age AND (public.dating_age_bounds(b))[2]<=a.max_age
 AND a.gender=ANY(b.seeking) AND b.gender=ANY(a.seeking))
 AND NOT EXISTS(SELECT 1 FROM public.dating_actions WHERE ((actor_id=p_a AND target_id=p_b) OR (actor_id=p_b AND target_id=p_a)) AND action IN ('pass','block'))
 AND NOT EXISTS(SELECT 1 FROM public.people_blocks WHERE (blocker_id=p_a AND blocked_id=p_b) OR (blocker_id=p_b AND blocked_id=p_a));
$$;
CREATE FUNCTION public.dating_pair_matched(p_a uuid,p_b uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.dating_pair_eligible(p_a,p_b)
 AND EXISTS(SELECT 1 FROM public.dating_actions WHERE actor_id=p_a AND target_id=p_b AND action='like')
 AND EXISTS(SELECT 1 FROM public.dating_actions WHERE actor_id=p_b AND target_id=p_a AND action='like');
$$;
CREATE FUNCTION public.dating_save_profile(p_birth_year integer,p_gender text,p_seeking text[],p_min_age integer,p_max_age integer,p_interests text[] DEFAULT '{}',p_birth_date date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE y integer:=extract(year FROM public.dating_today()); lower_age integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 PERFORM public.dating_lock_pair(auth.uid(),auth.uid());
 IF NOT public.dating_account_ready(auth.uid()) THEN RAISE EXCEPTION 'account_not_ready'; END IF;
 PERFORM public.dating_throttle('profile',20,900);
 IF p_birth_year NOT BETWEEN y-100 AND y-18 THEN RAISE EXCEPTION 'adult_only'; END IF;
 IF p_birth_date IS NOT NULL AND (extract(year FROM p_birth_date)<>p_birth_year OR p_birth_date>public.dating_today()) THEN RAISE EXCEPTION 'invalid_profile'; END IF;
 lower_age:=CASE WHEN p_birth_date IS NOT NULL THEN extract(year FROM age(public.dating_today(),p_birth_date))::int ELSE y-p_birth_year-1 END;
 IF lower_age<18 THEN
  IF p_birth_date IS NULL THEN RAISE EXCEPTION 'birth_date_required'; ELSE RAISE EXCEPTION 'adult_only'; END IF;
 END IF;
 INSERT INTO public.dating_profiles(user_id,enabled,birth_year,birth_date,gender,seeking,min_age,max_age,interests)
 VALUES(auth.uid(),true,p_birth_year,p_birth_date,p_gender,p_seeking,p_min_age,p_max_age,p_interests)
 ON CONFLICT(user_id) DO UPDATE SET enabled=true,birth_year=excluded.birth_year,birth_date=excluded.birth_date,gender=excluded.gender,seeking=excluded.seeking,min_age=excluded.min_age,max_age=excluded.max_age,interests=excluded.interests,updated_at=clock_timestamp();
 INSERT INTO public.dating_activity_privacy(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.dating_pause() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 PERFORM public.dating_lock_pair(auth.uid(),auth.uid());
 UPDATE public.dating_profiles SET enabled=false,updated_at=clock_timestamp() WHERE user_id=auth.uid();
END $$;
CREATE FUNCTION public.dating_set_activity_audience(p_audience text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.dating_profiles WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
 INSERT INTO public.dating_activity_privacy(user_id,audience) VALUES(auth.uid(),p_audience) ON CONFLICT(user_id) DO UPDATE SET audience=excluded.audience;
END $$;
CREATE FUNCTION public.dating_act(p_target uuid,p_action text,p_hide_activity boolean DEFAULT true) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_target=auth.uid() OR p_action NOT IN ('like','pass','block') THEN RAISE EXCEPTION 'invalid_action'; END IF;
 PERFORM public.dating_lock_pair(auth.uid(),p_target);
 IF p_action='like' AND NOT public.dating_pair_eligible(auth.uid(),p_target) THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF p_action<>'like' AND NOT public.dating_pair_eligible(auth.uid(),p_target)
 AND NOT EXISTS(SELECT 1 FROM public.dating_actions WHERE (actor_id=auth.uid() AND target_id=p_target) OR (actor_id=p_target AND target_id=auth.uid())) THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF p_action='like' THEN PERFORM public.dating_throttle('like',30,86400); END IF;
 INSERT INTO public.dating_actions(actor_id,target_id,action) VALUES(auth.uid(),p_target,p_action)
 ON CONFLICT(actor_id,target_id) DO UPDATE SET action=excluded.action;
 IF p_action='block' OR (p_action='pass' AND p_hide_activity) THEN
  INSERT INTO public.dating_activity_blocks(owner_id,viewer_id) VALUES(auth.uid(),p_target) ON CONFLICT DO NOTHING;
 END IF;
END $$;
CREATE FUNCTION public.dating_state(p_after uuid DEFAULT NULL,p_kind text DEFAULT 'discover') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; own public.dating_profiles; ready boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 PERFORM public.dating_throttle('discovery',240,3600);
 SELECT * INTO own FROM public.dating_profiles WHERE user_id=auth.uid();
 ready:=public.dating_account_ready(auth.uid());
 SELECT coalesce(jsonb_agg(card),'[]'::jsonb) INTO result FROM (
 SELECT jsonb_build_object('id',d.user_id,'name',coalesce(nullif(p.display_name,''),p.username),'avatar_url',CASE WHEN p.avatar_url ~ '^https://cdn[.]dalat[.]app/' OR p.avatar_url ~ '^https://aljcmodwjqlznzcydyor[.]supabase[.]co/storage/v1/object/public/avatars/' THEN p.avatar_url ELSE NULL END,
 'birth_year',d.birth_year,'gender',d.gender,'interests',d.interests,
 'liked',EXISTS(SELECT 1 FROM public.dating_actions WHERE actor_id=auth.uid() AND target_id=d.user_id AND action='like'),
 'likes_you',EXISTS(SELECT 1 FROM public.dating_actions WHERE actor_id=d.user_id AND target_id=auth.uid() AND action='like'),
 'matched',public.dating_pair_matched(auth.uid(),d.user_id)) AS card
 FROM public.dating_profiles d JOIN public.profiles p ON p.id=d.user_id
 WHERE (p_after IS NULL OR d.user_id>p_after) AND public.dating_pair_eligible(auth.uid(),d.user_id)
 AND (p_kind='discover' OR (p_kind='likes' AND EXISTS(SELECT 1 FROM public.dating_actions WHERE actor_id=d.user_id AND target_id=auth.uid() AND action='like')) OR (p_kind='matches' AND public.dating_pair_matched(auth.uid(),d.user_id)))
 ORDER BY d.user_id LIMIT 24) cards;
 RETURN jsonb_build_object('current_year',extract(year FROM public.dating_today())::int,'profile',CASE WHEN own.user_id IS NULL THEN NULL ELSE to_jsonb(own) END,
 'ready',ready,'cards',result,'audience',coalesce((SELECT audience FROM public.dating_activity_privacy WHERE user_id=auth.uid()),'only_me'),
 'suspended',EXISTS(SELECT 1 FROM public.dating_suspensions WHERE user_id=auth.uid()));
END $$;
CREATE FUNCTION public.dating_messages_get(p_target uuid,p_before timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.dating_pair_matched(auth.uid(),p_target) THEN RAISE EXCEPTION 'unavailable'; END IF;
 PERFORM public.dating_throttle('message_reads',600,3600);
 SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY created_at),'[]'::jsonb) INTO result FROM (
 SELECT id,sender_id,body,created_at FROM public.dating_messages
 WHERE ((sender_id=auth.uid() AND recipient_id=p_target) OR (sender_id=p_target AND recipient_id=auth.uid()))
 AND (p_before IS NULL OR created_at<p_before) ORDER BY created_at DESC LIMIT 50) m;
 RETURN result;
END $$;
CREATE FUNCTION public.dating_send_message(p_target uuid,p_body text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE new_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 PERFORM public.dating_lock_pair(auth.uid(),p_target);
 IF NOT public.dating_pair_matched(auth.uid(),p_target) THEN RAISE EXCEPTION 'unavailable'; END IF;
 PERFORM public.dating_throttle('message_minute',10,60);
 PERFORM public.dating_throttle('message_hour',100,3600);
 INSERT INTO public.dating_messages(sender_id,recipient_id,body) VALUES(auth.uid(),p_target,btrim(p_body)) RETURNING id INTO new_id;
 RETURN new_id;
END $$;
CREATE FUNCTION public.dating_report(p_target uuid,p_reason text,p_details text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_target=auth.uid() THEN RAISE EXCEPTION 'unauthorized'; END IF;
 PERFORM public.dating_lock_pair(auth.uid(),p_target);
 IF NOT public.dating_pair_eligible(auth.uid(),p_target) AND NOT EXISTS(SELECT 1 FROM public.dating_actions WHERE (actor_id=auth.uid() AND target_id=p_target) OR (actor_id=p_target AND target_id=auth.uid())) THEN RAISE EXCEPTION 'unavailable'; END IF;
 PERFORM public.dating_throttle('report',10,86400);
 INSERT INTO public.dating_reports(reporter_id,target_id,reason,details) VALUES(auth.uid(),p_target,p_reason,p_details) ON CONFLICT(reporter_id,target_id) WHERE status='open' DO NOTHING;
 INSERT INTO public.dating_actions(actor_id,target_id,action) VALUES(auth.uid(),p_target,'block') ON CONFLICT(actor_id,target_id) DO UPDATE SET action='block';
 INSERT INTO public.dating_activity_blocks(owner_id,viewer_id) VALUES(auth.uid(),p_target) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.dating_admin_reports() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.dating_is_staff() THEN RAISE EXCEPTION 'unauthorized'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
 SELECT r.*,p.display_name AS target_name,q.display_name AS reporter_name FROM public.dating_reports r
 JOIN public.profiles p ON p.id=r.target_id JOIN public.profiles q ON q.id=r.reporter_id
 WHERE status='open' ORDER BY created_at LIMIT 100) r),'[]'::jsonb);
END $$;
CREATE FUNCTION public.dating_admin_evidence(p_report uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.dating_reports;
BEGIN
 IF NOT public.dating_is_staff() THEN RAISE EXCEPTION 'unauthorized'; END IF;
 SELECT * INTO r FROM public.dating_reports WHERE id=p_report;
 IF r.id IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY created_at) FROM (
  SELECT id,sender_id,body,created_at FROM public.dating_messages WHERE
  (sender_id=r.reporter_id AND recipient_id=r.target_id) OR (sender_id=r.target_id AND recipient_id=r.reporter_id)
  ORDER BY created_at DESC LIMIT 50) m),'[]'::jsonb);
END $$;
CREATE FUNCTION public.dating_moderate(p_report uuid,p_suspend boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 IF NOT public.dating_is_staff() THEN RAISE EXCEPTION 'unauthorized'; END IF;
 SELECT target_id INTO target FROM public.dating_reports WHERE id=p_report;
 IF target IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
 PERFORM public.dating_lock_pair(target,target);
 IF p_suspend THEN
  INSERT INTO public.dating_suspensions(user_id,staff_id) VALUES(target,auth.uid()) ON CONFLICT DO NOTHING;
  UPDATE public.dating_profiles SET enabled=false WHERE user_id=target;
 END IF;
 UPDATE public.dating_reports SET status=CASE WHEN p_suspend THEN 'suspended' ELSE 'reviewed' END,reviewed_at=clock_timestamp(),reviewed_by=auth.uid() WHERE id=p_report;
END $$;
-- Future activity audience is independent from dating visibility. An anonymous
-- visitor never gets attendee identities, including for non-dating members.
CREATE FUNCTION dating_private.event_visible(p_event uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.events e WHERE e.id=p_event AND (
  public.dating_is_staff() OR public.can_edit_event(e.id) OR e.created_by=auth.uid() OR
  (e.status='published' AND (e.tribe_id IS NULL OR e.tribe_visibility='public' OR public.is_tribe_member(e.tribe_id)))
 ));
$$;
REVOKE ALL ON FUNCTION dating_private.event_visible(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dating_private.can_view_activity(p_target uuid,p_event uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE audience text;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 IF auth.uid()=p_target OR public.dating_is_staff() THEN RETURN true; END IF;
 IF p_event IS NOT NULL AND (public.can_edit_event(p_event) OR EXISTS(SELECT 1 FROM public.events e JOIN public.organizers o ON o.id=e.organizer_id WHERE e.id=p_event AND o.owner_id=auth.uid())) THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM public.dating_actions WHERE ((actor_id=auth.uid() AND target_id=p_target) OR (actor_id=p_target AND target_id=auth.uid())) AND action='block')
 OR EXISTS(SELECT 1 FROM public.people_blocks WHERE (blocker_id=auth.uid() AND blocked_id=p_target) OR (blocker_id=p_target AND blocked_id=auth.uid()))
 OR EXISTS(SELECT 1 FROM public.dating_activity_blocks WHERE owner_id=p_target AND viewer_id=auth.uid()) THEN RETURN false; END IF;
 SELECT p.audience INTO audience FROM public.dating_activity_privacy p WHERE user_id=p_target;
 IF audience IS NULL OR audience='members' THEN RETURN true; END IF;
 RETURN audience='matches' AND public.dating_pair_matched(auth.uid(),p_target);
END $$;
CREATE POLICY dating_rsvp_privacy ON public.rsvps AS RESTRICTIVE FOR SELECT USING(dating_private.can_view_activity(user_id,event_id));
CREATE POLICY dating_series_privacy ON public.series_rsvps AS RESTRICTIVE FOR SELECT USING(
 auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.event_series s WHERE s.id=series_id AND s.created_by=auth.uid()) OR dating_private.can_view_activity(user_id,NULL)));
CREATE POLICY dating_event_people_privacy ON public.event_people AS RESTRICTIVE FOR SELECT USING(dating_private.can_view_activity(user_id,event_id));
-- Disable dating when the public identity becomes private or unclaimed. Serialize
-- this and People blocks with sends so they cannot reopen a contact race.
CREATE FUNCTION public.dating_identity_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.dating_lock_pair(NEW.id,NEW.id);
 IF NEW.is_private OR coalesce(NEW.is_ghost,false) THEN UPDATE public.dating_profiles SET enabled=false WHERE user_id=NEW.id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dating_identity_changed BEFORE UPDATE OF is_private,is_ghost ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.dating_identity_changed();
CREATE FUNCTION public.dating_people_block_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM public.dating_lock_pair(NEW.blocker_id,NEW.blocked_id); RETURN NEW; END $$;
CREATE TRIGGER dating_people_block_lock BEFORE INSERT ON public.people_blocks FOR EACH ROW EXECUTE FUNCTION public.dating_people_block_lock();
-- No raw table is in a realtime publication. Every function defaults closed.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'dating_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.dating_state(uuid,text),public.dating_save_profile(integer,text,text[],integer,integer,text[],date),public.dating_pause(),public.dating_set_activity_audience(text),public.dating_act(uuid,text,boolean),public.dating_messages_get(uuid,timestamptz),public.dating_send_message(uuid,text),public.dating_report(uuid,text,text),public.dating_admin_reports(),public.dating_admin_evidence(uuid),public.dating_moderate(uuid,boolean),public.dating_is_staff() TO authenticated;
REVOKE ALL ON FUNCTION dating_private.can_view_activity(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION dating_private.can_view_activity(uuid,uuid) TO anon,authenticated;
COMMIT;
