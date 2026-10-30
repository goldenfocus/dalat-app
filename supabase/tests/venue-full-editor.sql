-- Run inside BEGIN/ROLLBACK. No identities, content, or permissions persist.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('79090000-0000-4000-8000-000000000001','owner-editor-qa@example.invalid','{}'),
 ('79090000-0000-4000-8000-000000000002','creator-editor-qa@example.invalid','{}'),
 ('79090000-0000-4000-8000-000000000003','pending-editor-qa@example.invalid','{}'),
 ('79090000-0000-4000-8000-000000000004','accepted-editor-qa@example.invalid','{}'),
 ('79090000-0000-4000-8000-000000000005','staff-editor-qa@example.invalid','{}');
INSERT INTO profiles(id,username,display_name,role) VALUES
 ('79090000-0000-4000-8000-000000000001','qa_venue_owner','QA owner','user'),
 ('79090000-0000-4000-8000-000000000002','qa_event_creator','QA creator','user'),
 ('79090000-0000-4000-8000-000000000003','qa_pending_editor','QA pending','user'),
 ('79090000-0000-4000-8000-000000000004','qa_accepted_editor','QA editor','user'),
 ('79090000-0000-4000-8000-000000000005','qa_checkin_staff','QA staff','user') ON CONFLICT(id) DO UPDATE SET role='user';
INSERT INTO venues(id,slug,name,latitude,longitude,owner_id) VALUES
 ('79091000-0000-4000-8000-000000000001','qa-editor-venue','QA editor venue',11.94,108.44,'79090000-0000-4000-8000-000000000001'),
 ('79091000-0000-4000-8000-000000000002','qa-other-venue','QA other venue',11.94,108.44,'79090000-0000-4000-8000-000000000002');
INSERT INTO venue_managers(venue_id,profile_id,role,accepted_at) VALUES
 ('79091000-0000-4000-8000-000000000001','79090000-0000-4000-8000-000000000003','editor',NULL),
 ('79091000-0000-4000-8000-000000000001','79090000-0000-4000-8000-000000000004','editor',now());
INSERT INTO event_series(id,slug,title,created_by,venue_id,rrule,starts_at_time,first_occurrence) VALUES
 ('79092000-0000-4000-8000-000000000001','qa-editor-series','QA series','79090000-0000-4000-8000-000000000002','79091000-0000-4000-8000-000000000001','FREQ=WEEKLY;BYDAY=WE','18:00','2026-11-04');
INSERT INTO events(id,slug,title,starts_at,created_by,venue_id,series_id,status) VALUES
 ('79093000-0000-4000-8000-000000000001','qa-editor-event','QA event','2026-11-04 11:00Z','79090000-0000-4000-8000-000000000002','79091000-0000-4000-8000-000000000001','79092000-0000-4000-8000-000000000001','published'),
 ('79093000-0000-4000-8000-000000000002','qa-unrelated-event','QA other event','2026-11-04 11:00Z','79090000-0000-4000-8000-000000000002','79091000-0000-4000-8000-000000000002',NULL,'published');
INSERT INTO event_staff(event_id,user_id,role) VALUES ('79093000-0000-4000-8000-000000000001','79090000-0000-4000-8000-000000000005','welcome');
CREATE FUNCTION pg_temp.assert_editor(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Editor assertion failed: %',label; END IF; END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79090000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_editor(can_edit_event('79093000-0000-4000-8000-000000000001'),'owner edits event created by another user');
SELECT pg_temp.assert_editor(can_edit_series('79092000-0000-4000-8000-000000000001'),'owner edits own venue series');
SELECT pg_temp.assert_editor(NOT can_edit_event('79093000-0000-4000-8000-000000000002'),'unrelated venue denied');
DO $$ DECLARE n integer; BEGIN
 UPDATE events SET title='QA revised',image_url='https://example.invalid/owner-cover.png' WHERE id='79093000-0000-4000-8000-000000000001';
 GET DIAGNOSTICS n=ROW_COUNT; PERFORM pg_temp.assert_editor(n=1,'owner writes title and image');
 UPDATE events SET title='Must not change' WHERE id='79093000-0000-4000-8000-000000000002';
 GET DIAGNOSTICS n=ROW_COUNT; PERFORM pg_temp.assert_editor(n=0,'unrelated update denied');
 BEGIN UPDATE events SET created_by=auth.uid() WHERE id='79093000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'owner hijacked creator'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE events SET venue_id='79091000-0000-4000-8000-000000000002' WHERE id='79093000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'owner changed scope'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE events SET sponsor_tier=3 WHERE id='79093000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'owner granted paid placement'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE event_series SET title='QA revised series',image_url='https://example.invalid/series-cover.png' WHERE id='79092000-0000-4000-8000-000000000001';
 GET DIAGNOSTICS n=ROW_COUNT; PERFORM pg_temp.assert_editor(n=1,'series save works');
END $$;
INSERT INTO event_settings(event_id,moments_enabled) VALUES('79093000-0000-4000-8000-000000000001',true) ON CONFLICT(event_id) DO UPDATE SET moments_enabled=true;
INSERT INTO event_private_details(event_id,address) VALUES('79093000-0000-4000-8000-000000000001','QA address') ON CONFLICT(event_id) DO UPDATE SET address='QA address';
INSERT INTO event_materials(event_id,material_type,file_url,created_by) VALUES('79093000-0000-4000-8000-000000000001','image','https://example.invalid/material.png',auth.uid());
INSERT INTO promo_media(event_id,media_type,media_url,created_by) VALUES('79093000-0000-4000-8000-000000000001','image','https://example.invalid/promo.png',auth.uid());
INSERT INTO promo_media(series_id,media_type,media_url,created_by) VALUES('79092000-0000-4000-8000-000000000001','image','https://example.invalid/series-promo.png',auth.uid());
SELECT pg_temp.assert_editor(can_manage_event_playlist('79093000-0000-4000-8000-000000000001'),'playlist editor works');
SELECT set_config('request.jwt.claim.sub','79090000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_editor(NOT can_edit_event('79093000-0000-4000-8000-000000000001'),'pending manager denied');
SELECT set_config('request.jwt.claim.sub','79090000-0000-4000-8000-000000000004',true);
SELECT pg_temp.assert_editor(can_edit_event('79093000-0000-4000-8000-000000000001'),'accepted editor allowed');
SELECT set_config('request.jwt.claim.sub','79090000-0000-4000-8000-000000000005',true);
SELECT pg_temp.assert_editor(NOT can_edit_event('79093000-0000-4000-8000-000000000001'),'check-in staff denied');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
-- A series spanning unrelated venues must not be editable in bulk by one venue.
UPDATE events SET series_id='79092000-0000-4000-8000-000000000001' WHERE id='79093000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79090000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_editor(NOT can_edit_series('79092000-0000-4000-8000-000000000001'),'mixed venue series denied');
RESET ROLE;
ROLLBACK;
SELECT 'venue editor security assertions passed; all fixtures rolled back' AS result;
