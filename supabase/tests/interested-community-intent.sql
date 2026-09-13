-- Run in a transaction; all fixtures must be rolled back.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
('81000000-0000-4000-8000-000000000001','interest-owner@example.invalid','{}'),
('81000000-0000-4000-8000-000000000002','interest-member@example.invalid','{}');
INSERT INTO tribes(id,slug,name,created_by,access_type) VALUES('83000000-0000-4000-8000-000000000001','qa-interest-community','QA interest community','81000000-0000-4000-8000-000000000001','public');
INSERT INTO events(id,slug,title,created_by,starts_at,ends_at,status,tribe_id,tribe_visibility) VALUES('82000000-0000-4000-8000-000000000001','qa-interest-event','QA interest event','81000000-0000-4000-8000-000000000001',now()+interval '2 days',now()+interval '2 days 2 hours','published','83000000-0000-4000-8000-000000000001','public');
INSERT INTO signup_intents(id,token_hash,kind,target_id,community_id,join_community,next_path,label,event_action) VALUES('84000000-0000-4000-8000-000000000001','interest-token','event','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',true,'/events/qa-interest-event','QA event','interested');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
DO $$ DECLARE result jsonb; BEGIN
 result:=complete_signup_intent('84000000-0000-4000-8000-000000000001','interest-token');
 IF result->>'rsvp_status'<>'interested' OR result->>'community_status'<>'joined' THEN RAISE EXCEPTION 'Interest and join not both completed: %',result; END IF;
 IF (SELECT status FROM rsvps WHERE event_id='82000000-0000-4000-8000-000000000001' AND user_id=auth.uid())<>'interested' THEN RAISE EXCEPTION 'Interest became RSVP'; END IF;
 IF NOT EXISTS(SELECT 1 FROM tribe_members WHERE tribe_id='83000000-0000-4000-8000-000000000001' AND user_id=auth.uid() AND status='active') THEN RAISE EXCEPTION 'Membership missing'; END IF;
 result:=complete_signup_intent('84000000-0000-4000-8000-000000000001','interest-token');
 IF result ? 'just_completed' THEN RAISE EXCEPTION 'Callback replay reports new action'; END IF;
END $$;
RESET ROLE;
SELECT 'Interested + community join + replay: PASS' AS result;
