BEGIN;
CREATE TABLE public.signup_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('community','event','profile')), target_id uuid NOT NULL,
 community_id uuid REFERENCES public.tribes(id) ON DELETE SET NULL,
 inviter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 join_community boolean NOT NULL DEFAULT false, invite_code text,
 next_path text NOT NULL, label text NOT NULL, locale text NOT NULL DEFAULT 'en',
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 completed_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE, result jsonb
);
CREATE INDEX signup_intents_expiry ON public.signup_intents(expires_at);
ALTER TABLE public.signup_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_intents FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.signup_intents TO service_role;
CREATE TABLE public.account_acquisitions (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 source_kind text NOT NULL CHECK(source_kind IN ('community','event','profile')),
 source_id uuid, community_id uuid REFERENCES public.tribes(id) ON DELETE SET NULL,
 inviter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 owner_at_signup uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 captured_at timestamptz NOT NULL, finalized_at timestamptz NOT NULL DEFAULT now(), policy_version integer NOT NULL DEFAULT 1
);
ALTER TABLE public.account_acquisitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_acquisitions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.account_acquisitions TO authenticated;
GRANT ALL ON public.account_acquisitions TO service_role;
CREATE POLICY acquisitions_read_own ON public.account_acquisitions FOR SELECT TO authenticated USING(user_id=auth.uid());
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
 UPDATE signup_intents SET completed_by=auth.uid(),result=v_result,invite_code=NULL WHERE id=i.id;
 RETURN v_result||jsonb_build_object('just_completed',true,'event_id',CASE WHEN i.kind='event' THEN i.target_id END);
END $$;
REVOKE ALL ON FUNCTION public.complete_signup_intent(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_signup_intent(uuid,text) TO authenticated;
COMMIT;
