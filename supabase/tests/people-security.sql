-- Executed only by scripts/test-people-sql.sh in its disposable local cluster.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected_state text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE EXCEPTION 'FAIL: %: expected %, got % (%)', label, expected_state, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL: %: statement unexpectedly succeeded', label;
END $$;
CREATE FUNCTION pg_temp.affected_rows(statement text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$;

INSERT INTO auth.users(id,email)
SELECT ('71000000-0000-4000-8000-00000000000' || i)::uuid, 'people-' || i || '@example.invalid'
FROM generate_series(1,7) i;
INSERT INTO public.profiles(id,username,display_name,is_private,is_ghost,role) VALUES
 ('71000000-0000-4000-8000-000000000001','qa_mai','Mai',false,false,'user'),
 ('71000000-0000-4000-8000-000000000002','qa_colin','Colin',false,false,'user'),
 ('71000000-0000-4000-8000-000000000003','qa_paused','Paused',false,false,'user'),
 ('71000000-0000-4000-8000-000000000004','qa_private','Private',true,false,'user'),
 ('71000000-0000-4000-8000-000000000005','qa_ghost','Ghost',false,true,'user'),
 ('71000000-0000-4000-8000-000000000006','qa_staff','Moderator',false,false,'moderator'),
 ('71000000-0000-4000-8000-000000000007','qa_viewer','Viewer',false,false,'user');
INSERT INTO public.people_profiles(user_id,enabled,intentions,interests,languages,help_offered,help_wanted) VALUES
 ('71000000-0000-4000-8000-000000000001',true,ARRAY['friendship','projects'],ARRAY['coffee'],ARRAY['vi','en'],'100% coffee advice','Website help'),
 ('71000000-0000-4000-8000-000000000002',true,ARRAY['activities'],ARRAY['hiking'],ARRAY['en'],'gardening_crew','Hiking buddies'),
 ('71000000-0000-4000-8000-000000000003',false,'{}','{}','{}','Paused offer',''),
 ('71000000-0000-4000-8000-000000000004',true,'{}','{}','{}','Private offer',''),
 ('71000000-0000-4000-8000-000000000005',true,'{}','{}','{}','Ghost offer','');
INSERT INTO public.events(id,created_by,title,status) VALUES
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000006','Public meetup','published'),
 ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000006','Hidden meetup','draft');
INSERT INTO public.rsvps(event_id,user_id,status) VALUES
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','going'),
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','interested'),
 ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','going');
INSERT INTO public.content_translations(content_type,content_id,target_locale,field_name,translated_text,source_updated_at)
SELECT 'people',user_id,'vi','help_offered','Translated ' || help_offered,content_updated_at FROM public.people_profiles;
INSERT INTO public.content_translations(content_type,content_id,target_locale,field_name,translated_text) VALUES
 ('event','72000000-0000-4000-8000-000000000001','vi','title','Public event translation'),
 ('profile','71000000-0000-4000-8000-000000000004','vi','bio','Private biography translation');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.expect_error('SELECT * FROM public.people_profiles','42501','anon cannot read profiles');
SELECT pg_temp.expect_error('SELECT * FROM public.people_blocks','42501','anon cannot read blocks');
SELECT pg_temp.expect_error('SELECT * FROM public.people_reports','42501','anon cannot read reports');
SELECT pg_temp.expect_error('SELECT * FROM public.event_people','42501','anon cannot read event introductions');
SELECT pg_temp.expect_error('SELECT * FROM public.discover_people()','42501','anon cannot discover');
SELECT pg_temp.assert_true(
 NOT has_function_privilege('anon','public.discover_people(text,text,text,integer,integer,uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','public.people_is_staff()','EXECUTE'),
 'hosted default grants do not expose member RPCs anonymously');
SELECT pg_temp.assert_true(NOT EXISTS (
 SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) role_name
 CROSS JOIN unnest(ARRAY['public.people_blocked(uuid)','public.prepare_people_profile()',
   'public.delete_people_translations()','public.revoke_event_people_on_rsvp()',
   'public.revoke_event_people_on_privacy()','public.guard_people_translation_revision()']) signature
 WHERE has_function_privilege(role_name,signature,'EXECUTE')
),'hosted default grants do not expose internal People helpers');
SELECT pg_temp.assert_true(NOT public.can_view_people_profile('71000000-0000-4000-8000-000000000001'),'anon visibility helper fails closed');
SELECT pg_temp.assert_true(NOT public.can_view_people_profile('79999999-0000-4000-8000-000000000099'),'anon helper gives same false result for nonexistent identity');
SELECT pg_temp.assert_true(NOT public.can_view_people_profile('71000000-0000-4000-8000-000000000004'),'anon helper gives same false result for private identity');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.content_translations WHERE content_type='people'),'anon cannot read People translations');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.content_translations WHERE content_type='profile'),'existing private biography protection preserved');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.content_translations WHERE content_type='event'),'unrelated public translations remain readable');
SELECT pg_temp.assert_true((SELECT count(*)=9 FROM public.people_options WHERE kind='intention'),'catalog is public');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000007',true);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.people_profiles),'signed-in nonparticipant can see only opted-in eligible people');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.discover_people()),'browse excludes paused/private/ghost');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.discover_people(p_search=>'mAI')),'case-insensitive name search');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.discover_people(p_search=>'%')),'percent is a literal, not wildcard');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.discover_people(p_search=>'_')),'underscore matches literal usernames');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.discover_people(p_search=>'\')),'backslash is a literal');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.discover_people(p_intention=>'projects',p_language=>'vi')),'intention and language filters combine');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.content_translations WHERE content_type='people'),'translation visibility follows profiles');
INSERT INTO public.people_profiles(user_id,enabled,source_locale)
VALUES(auth.uid(),false,NULL) ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,source_locale=EXCLUDED.source_locale;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.people_profiles WHERE user_id=auth.uid() AND source_locale IS NULL),'API profile insert supports pending language detection and owner SELECT');
INSERT INTO public.people_profiles(user_id,enabled,source_locale,help_offered)
VALUES(auth.uid(),false,NULL,'Saved through upsert') ON CONFLICT(user_id) DO UPDATE
SET user_id=EXCLUDED.user_id,enabled=EXCLUDED.enabled,source_locale=EXCLUDED.source_locale,help_offered=EXCLUDED.help_offered;
SELECT pg_temp.assert_true((SELECT help_offered='Saved through upsert' FROM public.people_profiles WHERE user_id=auth.uid()),'API profile upsert update has required grants and RLS');
DELETE FROM public.people_profiles WHERE user_id=auth.uid();
SELECT pg_temp.expect_error($s$INSERT INTO public.people_profiles(user_id) VALUES('71000000-0000-4000-8000-000000000006')$s$,'42501','cannot create another profile');
SELECT pg_temp.assert_true(pg_temp.affected_rows($s$UPDATE public.people_profiles SET enabled=false WHERE user_id='71000000-0000-4000-8000-000000000001'$s$)=0,'cannot update another profile');
SELECT pg_temp.assert_true(pg_temp.affected_rows($s$DELETE FROM public.people_profiles WHERE user_id='71000000-0000-4000-8000-000000000001'$s$)=0,'cannot delete another profile');
SELECT pg_temp.expect_error($s$SELECT public.people_blocked('71000000-0000-4000-8000-000000000001')$s$,'42501','reverse block helper is not an RPC');

SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.people_profiles WHERE user_id=auth.uid()),'owner sees own paused row');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.discover_people() WHERE user_id=auth.uid()),'owner paused row is excluded from discovery');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.content_translations WHERE content_type='people' AND content_id=auth.uid()),'owner sees own paused translations');

SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.expect_error($s$UPDATE public.people_profiles SET intentions=ARRAY['romance'] WHERE user_id=auth.uid()$s$,'23514','unapproved intention rejected');
SELECT pg_temp.expect_error($s$UPDATE public.people_profiles SET interests=ARRAY['coffee','coffee'] WHERE user_id=auth.uid()$s$,'23514','duplicate keys rejected');
SELECT pg_temp.expect_error($s$UPDATE public.people_profiles SET languages=ARRAY[NULL]::text[] WHERE user_id=auth.uid()$s$,'23514','null array entries rejected');
SELECT pg_temp.expect_error($s$UPDATE public.people_profiles SET languages=ARRAY[['en','vi'],['ko','zh']] WHERE user_id=auth.uid()$s$,'23514','multidimensional arrays rejected');
SELECT pg_temp.expect_error($s$UPDATE public.people_profiles SET help_offered=repeat('x',501) WHERE user_id=auth.uid()$s$,'23514','help text bounded');
SELECT pg_temp.expect_error($s$UPDATE public.people_profiles SET source_locale='unknown' WHERE user_id=auth.uid()$s$,'23514','non-null source locale must be supported');
UPDATE public.people_profiles SET source_locale=NULL WHERE user_id=auth.uid();
SELECT pg_temp.assert_true((SELECT source_locale IS NULL FROM public.people_profiles WHERE user_id=auth.uid()),'source locale can await language detection');
SELECT pg_temp.expect_error($s$UPDATE public.people_profiles SET user_id='71000000-0000-4000-8000-000000000007' WHERE user_id=auth.uid()$s$,'42501','identity immutable');
SELECT pg_temp.assert_true(pg_temp.affected_rows($s$DELETE FROM public.content_translations WHERE content_type='people' AND content_id='71000000-0000-4000-8000-000000000002'$s$)=0,'cannot erase someone else translations');
SELECT pg_temp.expect_error($s$INSERT INTO public.content_translations(content_type,content_id,target_locale,field_name,translated_text,source_updated_at) SELECT 'people',user_id,'fr','help_offered','Malicious',content_updated_at FROM public.people_profiles WHERE user_id=auth.uid()$s$,'42501','owner cannot impersonate translation worker');

INSERT INTO public.event_people(event_id,user_id) VALUES('72000000-0000-4000-8000-000000000001',auth.uid());
SELECT pg_temp.expect_error($s$INSERT INTO public.event_people(event_id,user_id) VALUES('72000000-0000-4000-8000-000000000002',auth.uid())$s$,'42501','cannot join unreadable event');
SELECT pg_temp.expect_error($s$INSERT INTO public.event_people(event_id,user_id) VALUES('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002')$s$,'42501','cannot consent for another attendee');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.expect_error($s$INSERT INTO public.event_people(event_id,user_id) VALUES('72000000-0000-4000-8000-000000000001',auth.uid())$s$,'42501','interested RSVP cannot opt into introductions');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.event_people),'eligible attendee visible');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.discover_people(p_event_id=>'72000000-0000-4000-8000-000000000001')),'event discovery includes only current participants');

-- Reports stay between their author and staff, including after a block.
INSERT INTO public.people_reports(reporter_id,reported_user_id,reason,details)
VALUES(auth.uid(),'71000000-0000-4000-8000-000000000001','spam','Test report');
SELECT pg_temp.expect_error($s$INSERT INTO public.people_reports(reporter_id,reported_user_id,reason) VALUES(auth.uid(),'71000000-0000-4000-8000-000000000001','other')$s$,'23505','only one unresolved report per pair');
SELECT pg_temp.expect_error($s$INSERT INTO public.people_reports(reporter_id,reported_user_id,reason,status) VALUES(auth.uid(),'71000000-0000-4000-8000-000000000003','other','reviewed')$s$,'42501','reporter cannot pre-review report');
SELECT pg_temp.expect_error($s$INSERT INTO public.people_reports(reporter_id,reported_user_id,reason) VALUES(auth.uid(),'71000000-0000-4000-8000-000000000003','other')$s$,'42501','cannot report unseen profile');
SELECT pg_temp.assert_true(pg_temp.affected_rows('UPDATE public.people_reports SET status=''reviewed''')=0,'reporter cannot review');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.people_reports),'reported user cannot read report');
SELECT pg_temp.expect_error($s$INSERT INTO public.people_blocks(blocker_id,blocked_id) VALUES('71000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000002')$s$,'42501','cannot block on behalf of another user');
SELECT pg_temp.expect_error($s$INSERT INTO public.people_blocks(blocker_id,blocked_id) VALUES(auth.uid(),auth.uid())$s$,'23514','cannot block self');
INSERT INTO public.people_blocks(blocker_id,blocked_id) VALUES(auth.uid(),'71000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error($s$INSERT INTO public.people_blocks(blocker_id,blocked_id) VALUES(auth.uid(),'71000000-0000-4000-8000-000000000002')$s$,'23505','repeated block reaches idempotent duplicate-key result');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.people_profiles WHERE user_id='71000000-0000-4000-8000-000000000002'),'blocker cannot discover blocked person');
INSERT INTO public.people_reports(reporter_id,reported_user_id,reason) VALUES(auth.uid(),'71000000-0000-4000-8000-000000000002','harassment');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.people_reports),'can report person after blocking');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.people_profiles WHERE user_id='71000000-0000-4000-8000-000000000001'),'blocked person cannot discover blocker');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.people_blocks),'blocked person cannot enumerate block records');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.event_people),'block excludes event introductions');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.content_translations WHERE content_type='people' AND content_id='71000000-0000-4000-8000-000000000001'),'block excludes translations');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.discover_people(p_event_id=>'72000000-0000-4000-8000-000000000001')),'block excludes filtered event discovery');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000006',true);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.people_reports),'moderator can review reports');
UPDATE public.people_reports SET status='reviewed';
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.people_reports WHERE status='reviewed'),'moderator status updates saved');
SELECT pg_temp.expect_error('UPDATE public.people_reports SET details=''changed''','42501','staff cannot alter reporter evidence');

SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
DELETE FROM public.people_blocks WHERE blocker_id=auth.uid();
UPDATE public.rsvps SET status='cancelled' WHERE user_id=auth.uid() AND event_id='72000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.event_people),'cancelling attendance revokes event consent');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.discover_people(p_event_id=>'72000000-0000-4000-8000-000000000001')),'cancelled owner is excluded from own event discovery');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000007',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.event_people),'cancelled RSVP suppresses attendee immediately');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
DELETE FROM public.event_people WHERE user_id=auth.uid();
UPDATE public.rsvps SET status='going' WHERE user_id=auth.uid() AND event_id='72000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.event_people),'rejoining does not restore event consent');
INSERT INTO public.event_people(event_id,user_id) VALUES('72000000-0000-4000-8000-000000000001',auth.uid());
-- Production RSVP status is nullable. Clearing it must revoke, not retain,
-- event consent that would silently reappear on the next going RSVP.
UPDATE public.rsvps SET status=NULL WHERE user_id=auth.uid() AND event_id='72000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.event_people),'null RSVP status revokes event consent');
UPDATE public.rsvps SET status='going' WHERE user_id=auth.uid() AND event_id='72000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.event_people),'rejoining after null RSVP does not restore event consent');
INSERT INTO public.event_people(event_id,user_id) VALUES('72000000-0000-4000-8000-000000000001',auth.uid());
UPDATE public.people_profiles SET enabled=false WHERE user_id=auth.uid();
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.event_people),'global People opt-out revokes event consent');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000007',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.people_profiles WHERE user_id='71000000-0000-4000-8000-000000000001'),'opt-out is immediate');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.content_translations WHERE content_type='people' AND content_id='71000000-0000-4000-8000-000000000001'),'opt-out hides translations');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
UPDATE public.people_profiles SET enabled=true WHERE user_id=auth.uid();
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.event_people),'re-enabling People does not restore event consent');
INSERT INTO public.event_people(event_id,user_id) VALUES('72000000-0000-4000-8000-000000000001',auth.uid());
UPDATE public.profiles SET is_private=true WHERE id=auth.uid();
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.event_people),'private profile revokes event consent');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000007',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.people_profiles WHERE user_id='71000000-0000-4000-8000-000000000001'),'private profile suppresses People');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.content_translations WHERE content_type='people' AND content_id='71000000-0000-4000-8000-000000000001'),'private profile suppresses People translations');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
UPDATE public.profiles SET is_private=false WHERE id=auth.uid();
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.event_people),'returning public does not restore event consent');
INSERT INTO public.event_people(event_id,user_id) VALUES('72000000-0000-4000-8000-000000000001',auth.uid());
DELETE FROM public.rsvps WHERE user_id=auth.uid() AND event_id='72000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.event_people),'deleting RSVP revokes event consent');

-- Transactional invalidation and stale worker-write guard.
RESET ROLE;
CREATE TEMP TABLE previous_revision AS SELECT content_updated_at FROM public.people_profiles WHERE user_id='71000000-0000-4000-8000-000000000001';
GRANT SELECT ON previous_revision TO authenticated, service_role;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
UPDATE public.people_profiles SET help_offered='New offer',content_updated_at='2099-01-01' WHERE user_id=auth.uid();
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.content_translations WHERE content_type='people' AND content_id=auth.uid()),'source change atomically deletes old translations');
SELECT pg_temp.assert_true((SELECT content_updated_at<'2099-01-01'::timestamptz FROM public.people_profiles WHERE user_id=auth.uid()),'client cannot spoof revision');
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error($s$INSERT INTO public.content_translations(content_type,content_id,target_locale,field_name,translated_text,source_updated_at) SELECT 'people','71000000-0000-4000-8000-000000000001','vi','help_offered','Stale offer',content_updated_at FROM previous_revision$s$,'40001','stale worker cannot restore old copy');
SELECT pg_temp.expect_error($s$INSERT INTO public.content_translations(content_type,content_id,target_locale,field_name,translated_text) VALUES('people','71000000-0000-4000-8000-000000000001','vi','help_offered','No revision')$s$,'40001','People translation requires source revision');
INSERT INTO public.content_translations(content_type,content_id,target_locale,field_name,translated_text,source_updated_at)
SELECT 'people',user_id,'vi','help_offered','Current offer',content_updated_at FROM public.people_profiles WHERE user_id='71000000-0000-4000-8000-000000000001';
SELECT pg_temp.expect_error($s$UPDATE public.content_translations SET content_type='profile',field_name='bio' WHERE content_type='people' AND content_id='71000000-0000-4000-8000-000000000001'$s$,'42501','translation cannot change type to evade visibility');
SELECT pg_temp.expect_error($s$INSERT INTO public.content_translations(content_type,content_id,target_locale,field_name,translated_text,source_updated_at) SELECT 'people',user_id,'vi','bio','Wrong field',content_updated_at FROM public.people_profiles WHERE user_id='71000000-0000-4000-8000-000000000001'$s$,'23514','People translation field allowlist');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
UPDATE public.people_profiles SET interests=ARRAY['coffee','art'] WHERE user_id=auth.uid();
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.content_translations WHERE content_type='people' AND content_id=auth.uid()),'catalog-only edit preserves valid translations');
UPDATE public.people_profiles SET help_offered='' WHERE user_id=auth.uid();
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.content_translations WHERE content_type='people' AND content_id=auth.uid()),'clearing source deletes its translations');
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error($s$INSERT INTO public.content_translations(content_type,content_id,target_locale,field_name,translated_text,source_updated_at) SELECT 'people',user_id,'vi','help_offered','Empty source',content_updated_at FROM public.people_profiles WHERE user_id='71000000-0000-4000-8000-000000000001'$s$,'23514','worker cannot translate cleared source');
-- Existing unrelated field values remain valid.
INSERT INTO public.content_translations(content_type,content_id,target_locale,field_name,translated_text)
VALUES('track','73000000-0000-4000-8000-000000000001','vi','lyrics','Existing lyrics');
INSERT INTO public.content_translations(content_type,content_id,target_locale,field_name,translated_text)
VALUES('moment','73000000-0000-4000-8000-000000000002','vi','pdf_extracted_text','Existing extract');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
DELETE FROM public.people_profiles WHERE user_id=auth.uid();
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.profiles WHERE id=auth.uid()),'deleting People profile preserves existing identity');
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.content_translations WHERE content_type='people' AND content_id='71000000-0000-4000-8000-000000000002'),'deleting People profile cleans up translated copy');

RESET ROLE;
SELECT pg_temp.assert_true((SELECT reason='Route: /people' FROM public.reserved_slugs WHERE slug='people'),'route reserved without replacing a claimant');
SELECT 'People security assertions passed' AS result;
ROLLBACK;
