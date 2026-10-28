-- Run after arrival-bootstrap.sql and the private language profile migration.
BEGIN;
INSERT INTO auth.users(id) VALUES ('98000000-0000-4000-8000-000000000001'),('98000000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(id,username) VALUES ('98000000-0000-4000-8000-000000000001','language_self'),('98000000-0000-4000-8000-000000000002','language_other');
DO $$
DECLARE prefs jsonb := '{"speaks":[{"language":"en","level":"native"}],"learning":{"language":"vi","level":"new"}}';
BEGIN
 IF NOT valid_event_language_preferences(prefs) THEN RAISE EXCEPTION 'Valid languages rejected'; END IF;
 IF valid_event_language_preferences(jsonb_set(prefs,'{learning,level}','"native"')) THEN RAISE EXCEPTION 'Native learning target accepted'; END IF;
 IF valid_event_language_preferences(prefs || '{"user_id":"other"}') THEN RAISE EXCEPTION 'Unknown preferences fields accepted'; END IF;
 IF valid_event_language_preferences(jsonb_set(prefs,'{speaks}','[{"language":"en","level":"native"},{"language":"en","level":"fluent"}]')) THEN RAISE EXCEPTION 'Duplicate language accepted'; END IF;
 IF valid_event_language_preferences(jsonb_set(prefs,'{speaks,0,language}','"xx"')) THEN RAISE EXCEPTION 'Unknown language accepted'; END IF;
 IF valid_event_language_preferences(jsonb_set(prefs,'{speaks}','[]')) THEN RAISE EXCEPTION 'Empty spoken languages accepted'; END IF;
 IF has_table_privilege('anon','event_language_profiles','SELECT') THEN RAISE EXCEPTION 'Anonymous access granted'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',true);
INSERT INTO public.event_language_profiles(user_id,preferences) VALUES ('98000000-0000-4000-8000-000000000001','{"speaks":[{"language":"en","level":"native"}],"learning":{"language":"vi","level":"new"}}');
DO $$ BEGIN
 BEGIN
  INSERT INTO public.event_language_profiles(user_id,preferences) VALUES ('98000000-0000-4000-8000-000000000002','{"speaks":[{"language":"fr","level":"native"}],"learning":{"language":"vi","level":"new"}}');
  RAISE EXCEPTION 'Cross-account write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.event_language_profiles) THEN RAISE EXCEPTION 'Cross-account read exposed'; END IF;
 UPDATE public.event_language_profiles SET preferences='{"speaks":[{"language":"fr","level":"native"}],"learning":{"language":"vi","level":"new"}}' WHERE user_id='98000000-0000-4000-8000-000000000001';
 IF FOUND THEN RAISE EXCEPTION 'Cross-account update accepted'; END IF;
END $$;
RESET ROLE;
ROLLBACK;

BEGIN;
INSERT INTO auth.users(id) VALUES ('98000000-0000-4000-8000-000000000003');
INSERT INTO public.profiles(id,username) VALUES ('98000000-0000-4000-8000-000000000003','language_snapshot');
INSERT INTO public.event_language_profiles(user_id,preferences) VALUES ('98000000-0000-4000-8000-000000000003','{"speaks":[{"language":"en","level":"native"}],"learning":{"language":"vi","level":"new"}}');
INSERT INTO public.events(id,created_by,status,starts_at,ends_at) VALUES ('98000000-0000-4000-8000-000000000004','98000000-0000-4000-8000-000000000003','published',now(),now()+interval '2 hours');
INSERT INTO public.event_arrival_participants(event_id,user_id,nickname,token_hash,practice_language)
VALUES ('98000000-0000-4000-8000-000000000004','98000000-0000-4000-8000-000000000003','Snapshot',repeat('4',64),'vietnamese');
INSERT INTO public.event_arrival_participants(event_id,nickname,token_hash,practice_language,language_preferences)
VALUES ('98000000-0000-4000-8000-000000000004','Guest snapshot',repeat('5',64),'vietnamese','{"speaks":[{"language":"ja","level":"native"}],"learning":{"language":"vi","level":"new"}}');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.event_arrival_participants WHERE nickname='Guest snapshot' AND language_preferences IS NOT NULL) THEN RAISE EXCEPTION 'Caller forged a language snapshot'; END IF;
END $$;
UPDATE public.event_language_profiles SET preferences='{"speaks":[{"language":"fr","level":"native"}],"learning":{"language":"vi","level":"beginner"}}' WHERE user_id='98000000-0000-4000-8000-000000000003';
UPDATE public.event_arrival_participants SET language_preferences='{"speaks":[{"language":"ja","level":"native"}],"learning":{"language":"vi","level":"fluent"}}' WHERE user_id='98000000-0000-4000-8000-000000000003';
DO $$ BEGIN
 IF (SELECT language_preferences->'speaks'->0->>'language' FROM public.event_arrival_participants WHERE user_id='98000000-0000-4000-8000-000000000003') <> 'en' THEN RAISE EXCEPTION 'Event-time language snapshot changed'; END IF;
 IF (SELECT language_preferences->'learning'->>'level' FROM public.event_arrival_participants WHERE user_id='98000000-0000-4000-8000-000000000003') <> 'new' THEN RAISE EXCEPTION 'Profile update changed event-time level'; END IF;
END $$;
ROLLBACK;
