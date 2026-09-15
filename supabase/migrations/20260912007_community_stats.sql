BEGIN;
CREATE TABLE public.community_visits (
 id uuid PRIMARY KEY, community_id uuid NOT NULL REFERENCES tribes(id) ON DELETE CASCADE,
 source text NOT NULL DEFAULT 'direct', campaign text, created_at timestamptz NOT NULL DEFAULT now(),
 event_clicks integer NOT NULL DEFAULT 0, join_clicks integer NOT NULL DEFAULT 0, share_clicks integer NOT NULL DEFAULT 0,
 joined_at timestamptz, joined_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL
);
CREATE INDEX community_visits_period ON public.community_visits(community_id,created_at);
CREATE UNIQUE INDEX community_visits_one_conversion ON public.community_visits(community_id,joined_user_id) WHERE joined_user_id IS NOT NULL;
ALTER TABLE public.community_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_visits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.community_visits TO service_role;
CREATE TABLE public.community_membership_activity (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 community_id uuid NOT NULL REFERENCES tribes(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('joined','left','blocked','unblocked','role_changed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_membership_activity_period ON public.community_membership_activity(community_id,created_at);
ALTER TABLE public.community_membership_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_membership_activity FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.community_membership_activity TO service_role;
CREATE FUNCTION public.log_community_membership_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM tribes WHERE id=OLD.tribe_id) THEN RETURN OLD; END IF;
  k:='left';
 ELSIF TG_OP='INSERT' THEN k:=CASE WHEN NEW.status='banned' THEN 'blocked' ELSE 'joined' END;
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN k:=CASE WHEN NEW.status='banned' THEN 'blocked' ELSE 'unblocked' END;
 ELSIF NEW.role IS DISTINCT FROM OLD.role THEN k:='role_changed';
 ELSE RETURN NEW;
 END IF;
 INSERT INTO community_membership_activity(community_id,kind) VALUES(CASE WHEN TG_OP='DELETE' THEN OLD.tribe_id ELSE NEW.tribe_id END,k);
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER log_community_membership_activity AFTER INSERT OR UPDATE OR DELETE ON public.tribe_members FOR EACH ROW EXECUTE FUNCTION public.log_community_membership_activity();
CREATE FUNCTION public.record_community_visit(p_id uuid,p_community_id uuid,p_kind text,p_source text,p_campaign text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_kind NOT IN ('view','event_click','join_click','share_click') THEN RAISE EXCEPTION 'Invalid metric'; END IF;
 INSERT INTO community_visits(id,community_id,source,campaign) VALUES(p_id,p_community_id,left(p_source,32),left(p_campaign,64)) ON CONFLICT(id) DO NOTHING;
 UPDATE community_visits SET event_clicks=least(50,event_clicks+CASE WHEN p_kind='event_click' THEN 1 ELSE 0 END),join_clicks=least(50,join_clicks+CASE WHEN p_kind='join_click' THEN 1 ELSE 0 END),share_clicks=least(50,share_clicks+CASE WHEN p_kind='share_click' THEN 1 ELSE 0 END) WHERE id=p_id AND community_id=p_community_id AND created_at>now()-interval '90 days';
 DELETE FROM community_visits WHERE created_at<now()-interval '90 days';
 DELETE FROM community_membership_activity WHERE created_at<now()-interval '90 days';
END $$;
REVOKE ALL ON FUNCTION public.record_community_visit(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_community_visit(uuid,uuid,text,text,text) TO service_role;
CREATE FUNCTION public.complete_community_visit(p_visit_id uuid,p_community_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN; END IF;
 UPDATE community_visits v SET joined_at=now(),joined_user_id=auth.uid()
 WHERE v.id=p_visit_id AND v.community_id=p_community_id AND v.joined_at IS NULL
 AND EXISTS(SELECT 1 FROM tribe_members m WHERE m.tribe_id=v.community_id AND m.user_id=auth.uid() AND m.status='active' AND m.joined_at>=v.created_at AND m.joined_at>now()-interval '10 minutes');
 EXCEPTION WHEN unique_violation THEN NULL;
END $$;
REVOKE ALL ON FUNCTION public.complete_community_visit(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_community_visit(uuid,uuid) TO authenticated;
ALTER TABLE public.signup_intents ADD COLUMN visit_id uuid REFERENCES community_visits(id) ON DELETE SET NULL;
CREATE FUNCTION public.get_community_stats(p_community_id uuid,p_days integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE since timestamptz:=now()-make_interval(days=>least(90,greatest(1,p_days)));
BEGIN
 IF auth.uid() IS NULL OR NOT (is_tribe_admin(p_community_id) OR is_admin()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'members',(SELECT count(*) FROM tribe_members WHERE tribe_id=p_community_id AND status='active'),
 'pending',(SELECT count(*) FROM tribe_requests WHERE tribe_id=p_community_id AND status='pending'),
 'blocked',(SELECT count(*) FROM tribe_members WHERE tribe_id=p_community_id AND status='banned'),
 'visits',(SELECT count(*) FROM community_visits WHERE community_id=p_community_id AND created_at>=since),
 'event_clicks',(SELECT coalesce(sum(event_clicks),0) FROM community_visits WHERE community_id=p_community_id AND created_at>=since),
 'join_clicks',(SELECT coalesce(sum(join_clicks),0) FROM community_visits WHERE community_id=p_community_id AND created_at>=since),
 'share_clicks',(SELECT coalesce(sum(share_clicks),0) FROM community_visits WHERE community_id=p_community_id AND created_at>=since),
 'conversions',(SELECT count(*) FROM community_visits WHERE community_id=p_community_id AND created_at>=since AND joined_at IS NOT NULL),
 'new_accounts',(SELECT count(*) FROM account_acquisitions WHERE community_id=p_community_id AND finalized_at>=since),
 'joins',(SELECT count(*) FROM community_membership_activity WHERE community_id=p_community_id AND created_at>=since AND kind='joined'),
 'leaves',(SELECT count(*) FROM community_membership_activity WHERE community_id=p_community_id AND created_at>=since AND kind='left'),
 'sources',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT v.source,v.campaign,count(*) visits,count(*) FILTER(WHERE v.joined_at IS NOT NULL) joins,count(a.user_id) new_accounts FROM community_visits v LEFT JOIN account_acquisitions a ON a.user_id=v.joined_user_id AND a.community_id=v.community_id AND a.finalized_at>=v.created_at WHERE v.community_id=p_community_id AND v.created_at>=since GROUP BY v.source,v.campaign ORDER BY count(*) DESC LIMIT 25)x)
 );
END $$;
REVOKE ALL ON FUNCTION public.get_community_stats(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_community_stats(uuid,integer) TO authenticated;
COMMENT ON TABLE public.community_visits IS 'Estimated 30-minute browser visits; no IP, full referrer, contact data or fingerprint. Raw metrics retained 90 days. Browser events are advisory; joins are checked against membership.';
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
  IF EXISTS(SELECT 1 FROM event_questionnaires q JOIN event_questions eq ON eq.questionnaire_id=q.id WHERE q.event_id=i.target_id AND q.is_enabled) THEN
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
