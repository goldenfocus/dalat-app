-- Run within a transaction on the full schema; caller always rolls back.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('87000000-0000-4000-8000-000000000001','language-owner@example.invalid','{}'),
 ('87000000-0000-4000-8000-000000000002','language-guest@example.invalid','{}');
INSERT INTO events(id,slug,title,created_by,starts_at,ends_at,status,arrival_enabled) VALUES
 ('87000000-0000-4000-8000-000000000003','qa-compact-language-exchange','QA language exchange','87000000-0000-4000-8000-000000000001',now(),now()+interval '2 hours','published',true);
INSERT INTO signup_intents(id,token_hash,kind,target_id,join_community,next_path,label,event_action) VALUES
 ('87000000-0000-4000-8000-000000000004','qa-language-token','event','87000000-0000-4000-8000-000000000003',false,'/events/qa-compact-language-exchange','QA language exchange','going');
SELECT set_config('request.jwt.claim.sub','87000000-0000-4000-8000-000000000002',true);
DO $$ DECLARE result jsonb; BEGIN
 result:=complete_signup_intent('87000000-0000-4000-8000-000000000004','qa-language-token');
 IF NOT (result->>'rsvp_pending')::boolean THEN RAISE EXCEPTION 'Signup skipped language RSVP'; END IF;
 IF EXISTS(SELECT 1 FROM rsvps WHERE event_id='87000000-0000-4000-8000-000000000003' AND user_id='87000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Signup RSVP ran before preferences'; END IF;
 IF has_table_privilege('anon','language_exchange_preferences','SELECT') OR has_table_privilege('authenticated','language_exchange_preferences','SELECT') THEN RAISE EXCEPTION 'Private preferences exposed'; END IF;
END $$;
INSERT INTO language_exchange_preferences(user_id,practice_language,english_level,vietnamese_level) VALUES
 ('87000000-0000-4000-8000-000000000002','vietnamese','native','starting');
DO $$ DECLARE result jsonb; level text; BEGIN
 IF EXISTS(SELECT 1 FROM event_arrival_participants WHERE event_id='87000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Saving preferences checked attendee in'; END IF;
 FOREACH level IN ARRAY ARRAY['starting','some','comfortable','advanced','fluent','native'] LOOP
  result:=arrival_submit('87000000-0000-4000-8000-000000000003',NULL,encode(sha256(level::bytea),'hex'),gen_random_uuid(),jsonb_build_object('nickname','QA guest','practiceLanguage','both','englishLevel',level,'vietnameseLevel',level));
  IF result->'participant'->>'english_level' IS DISTINCT FROM level THEN RAISE EXCEPTION 'Level did not survive check-in: %',level; END IF;
 END LOOP;
 BEGIN
  PERFORM arrival_submit('87000000-0000-4000-8000-000000000003',NULL,repeat('a',64),gen_random_uuid(),'{"nickname":"Invalid","practiceLanguage":"both","englishLevel":"unknown"}');
  RAISE EXCEPTION 'Invalid level was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $$;
SELECT 'Language preferences, private access, signup gating, all six levels: PASS' AS result;
