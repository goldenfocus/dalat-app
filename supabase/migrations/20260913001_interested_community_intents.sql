BEGIN;
ALTER TABLE public.signup_intents ADD COLUMN event_action text NOT NULL DEFAULT 'going' CHECK(event_action IN ('going','interested'));
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
  ELSIF EXISTS(SELECT 1 FROM event_questionnaires q JOIN event_questions eq ON eq.questionnaire_id=q.id WHERE q.event_id=i.target_id AND q.is_enabled) THEN
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
