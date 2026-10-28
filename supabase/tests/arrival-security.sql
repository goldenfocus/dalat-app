-- Runs only against disposable fixture schema, always rolls back its data.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(statement text,state text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE=state THEN RETURN; END IF;
  RAISE EXCEPTION 'FAIL: % expected %, got % (%)',label,state,SQLSTATE,SQLERRM;
 END;
 RAISE EXCEPTION 'FAIL: % unexpectedly succeeded',label;
END $$;
INSERT INTO auth.users SELECT ('71000000-0000-4000-8000-00000000000'||n)::uuid FROM generate_series(1,6)n;
INSERT INTO profiles(id,username,role) SELECT id,'arrival_'||right(id::text,1),'user' FROM auth.users;
INSERT INTO venues(id,owner_id) VALUES('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001');
UPDATE venues SET preorder_enabled=true;
INSERT INTO events(id,created_by,venue_id,status,starts_at,ends_at) VALUES
 ('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','published',now(),now()+interval '2 hours'),
 ('73000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000006','72000000-0000-4000-8000-000000000001','published',now()+interval '8 days',now()+interval '8 days 2 hours');
INSERT INTO venue_menu_sections(id,venue_id,slug,title) VALUES('74000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','drinks','Drinks');
INSERT INTO venue_menu_items(id,venue_id,section_id,name,price_vnd) VALUES('75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','Coffee',35000);
INSERT INTO event_staff(event_id,user_id,role) VALUES
 ('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','welcome'),
 ('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003','orders');
INSERT INTO rsvps(event_id,user_id,status) VALUES('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000004','going');

SELECT pg_temp.assert_true(NOT has_function_privilege('anon','arrival_submit(uuid,uuid,text,uuid,jsonb)','EXECUTE'),'anonymous RPC denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','arrival_access(uuid,uuid)','EXECUTE'),'actor spoofing from browser denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','arrival_staff_action(uuid,uuid,jsonb)','EXECUTE'),'staff action spoofing denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('service_role','arrival_receipt(uuid,uuid)','EXECUTE'),'internal receipt helper denied');
SELECT pg_temp.assert_true(NOT has_table_privilege('anon','event_arrival_participants','SELECT') AND NOT has_table_privilege('authenticated','event_staff','SELECT'),'private tables denied');
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('SELECT * FROM event_arrival_participants','42501','anonymous participant read');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true((arrival_access('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001')->>'canManage')::boolean,'owner manager');
SELECT pg_temp.assert_true((arrival_access('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002')->>'canWelcome')::boolean AND NOT (arrival_access('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002')->>'canOrder')::boolean,'welcome role scope');
SELECT pg_temp.assert_true((arrival_access('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003')->>'canWelcome')::boolean AND (arrival_access('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003')->>'canOrder')::boolean,'order taker can check in and order');
SELECT pg_temp.assert_true(NOT (arrival_access('73000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002')->>'canWelcome')::boolean,'staff event scope');
DO $$
DECLARE e uuid:='73000000-0000-4000-8000-000000000001'; a jsonb; b jsonb; pid uuid; oid uuid; payload jsonb;
BEGIN
 payload:='{"nickname":"Guest Mai","practiceLanguage":"english","englishLevel":"starting","items":[{"item_id":"75000000-0000-4000-8000-000000000001","qty":2,"price_vnd":1}],"total_vnd":1}';
 a:=arrival_submit(e,NULL,repeat('a',64),'76000000-0000-4000-8000-000000000001',payload);
 b:=arrival_submit(e,NULL,repeat('a',64),'76000000-0000-4000-8000-000000000001',payload);
 PERFORM pg_temp.assert_true(a=b,'exact retry returns identical receipt');
 PERFORM pg_temp.assert_true((a->'order'->>'total_vnd')::integer=70000,'server price ignores tampering');
 PERFORM pg_temp.assert_true(NOT (a->'participant' ? 'token_hash'),'receipt never returns hash');
 pid:=(a->'participant'->>'id')::uuid; oid:=(a->'order'->>'id')::uuid;
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM event_preorders WHERE participant_id=pid),'one order on retry');
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,NULL,%L,%L,%L)',e,repeat('b',64),'76000000-0000-4000-8000-000000000001',payload),'40001','request theft');
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,NULL,%L,%L,%L)',e,repeat('a',64),'76000000-0000-4000-8000-000000000001',payload||'{"nickname":"Changed"}'),'40001','request body changed');
 b:=arrival_submit(e,NULL,repeat('b',64),'76000000-0000-4000-8000-000000000002','{"nickname":"Guest Mai","practiceLanguage":"english"}');
 PERFORM pg_temp.assert_true((b->'participant'->>'id')::uuid<>pid,'same nickname is not identity');
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,NULL,%L,%L,%L)',e,repeat('c',64),gen_random_uuid(),'{"nickname":"Evil","practiceLanguage":"vietnamese","userId":"71000000-0000-4000-8000-000000000004"}'),'42501','guest cannot claim user');
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,NULL,%L,%L,%L)','73000000-0000-4000-8000-000000000002',repeat('d',64),gen_random_uuid(),payload),'22023','future remote check-in denied');
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,%L,%L,%L,%L)',e,'71000000-0000-4000-8000-000000000002',repeat('e',64),gen_random_uuid(),payload||'{"staffEntry":true}'),'42501','welcome cannot order');
 PERFORM pg_temp.expect_error(format('SELECT arrival_staff_action(%L,%L,%L)',e,'71000000-0000-4000-8000-000000000002',jsonb_build_object('action','setPaid','orderId',oid,'paid',true)),'42501','welcome cannot mark paid');
 PERFORM arrival_staff_action(e,'71000000-0000-4000-8000-000000000003',jsonb_build_object('action','setPaid','orderId',oid,'paid',true));
 PERFORM pg_temp.assert_true((SELECT paid_at IS NOT NULL AND status='pending' FROM event_preorders WHERE id=oid),'payment independent of fulfillment');
 PERFORM arrival_staff_action(e,'71000000-0000-4000-8000-000000000003',jsonb_build_object('action','setOrderStatus','orderId',oid,'status','confirmed','expectedStatus','pending'));
 PERFORM pg_temp.expect_error(format('SELECT arrival_staff_action(%L,%L,%L)',e,'71000000-0000-4000-8000-000000000003',jsonb_build_object('action','setOrderStatus','orderId',oid,'status','cancelled','expectedStatus','pending')),'40001','stale status write refused');
 PERFORM pg_temp.expect_error(format('SELECT arrival_staff_action(%L,%L,%L)','73000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001',jsonb_build_object('action','setPaid','orderId',oid,'paid',true)),'22023','order bound to event');
 PERFORM pg_temp.expect_error(format('SELECT arrival_staff_action(%L,%L,%L)',e,'71000000-0000-4000-8000-000000000002','{"action":"addStaff","username":"arrival_5","role":"manager"}'),'42501','welcome cannot grant role');
 PERFORM arrival_staff_action(e,'71000000-0000-4000-8000-000000000001','{"action":"addStaff","username":"arrival_5","role":"manager"}');
 PERFORM pg_temp.assert_true((arrival_access(e,'71000000-0000-4000-8000-000000000005')->>'canManage')::boolean,'manager assigned by exact username');
 PERFORM arrival_staff_action(e,'71000000-0000-4000-8000-000000000001','{"action":"removeStaff","userId":"71000000-0000-4000-8000-000000000005"}');
 PERFORM pg_temp.assert_true(NOT (arrival_access(e,'71000000-0000-4000-8000-000000000005')->>'canManage')::boolean,'revocation immediately effective');
END $$;
RESET ROLE;
-- Validation failures are atomic: no participant or receipt survives rejected input.
SET LOCAL ROLE service_role;
DO $$
DECLARE e uuid:='73000000-0000-4000-8000-000000000001'; before_count integer; receipt jsonb; participant uuid;
BEGIN
 SELECT count(*) INTO before_count FROM event_arrival_participants;
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,NULL,%L,%L,%L)',e,repeat('f',64),gen_random_uuid(),'{"nickname":"Bad quantity","practiceLanguage":"english","items":[{"item_id":"75000000-0000-4000-8000-000000000001","qty":0}]}'),'22023','zero quantity refused');
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,NULL,%L,%L,%L)',e,repeat('f',64),gen_random_uuid(),'{"nickname":"Bad item","practiceLanguage":"english","items":[{"item_id":"75999999-0000-4000-8000-000000000099","qty":1}]}'),'22023','foreign or missing menu item refused');
 UPDATE venue_menu_items SET is_sold_out=true;
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,NULL,%L,%L,%L)',e,repeat('f',64),gen_random_uuid(),'{"nickname":"Sold out","practiceLanguage":"english","items":[{"item_id":"75000000-0000-4000-8000-000000000001","qty":1}]}'),'22023','sold out item refused');
 UPDATE venue_menu_items SET is_sold_out=false;
 UPDATE venue_menu_sections SET is_visible=false;
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,NULL,%L,%L,%L)',e,repeat('f',64),gen_random_uuid(),'{"nickname":"Hidden","practiceLanguage":"english","items":[{"item_id":"75000000-0000-4000-8000-000000000001","qty":1}]}'),'22023','hidden section refused');
 UPDATE venue_menu_sections SET is_visible=true;
 UPDATE events SET status='draft' WHERE id=e;
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,NULL,%L,%L,%L)',e,repeat('f',64),gen_random_uuid(),'{"nickname":"Draft","practiceLanguage":"english"}'),'22023','draft event refused');
 UPDATE events SET status='published',tribe_id=gen_random_uuid(),tribe_visibility='private' WHERE id=e;
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,NULL,%L,%L,%L)',e,repeat('f',64),gen_random_uuid(),'{"nickname":"Private","practiceLanguage":"english"}'),'22023','private event refused');
 UPDATE events SET tribe_id=NULL,tribe_visibility=NULL WHERE id=e;
 PERFORM pg_temp.assert_true((SELECT count(*)=before_count FROM event_arrival_participants),'rejected intake leaves no participants');
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,%L,%L,%L,%L)',e,'71000000-0000-4000-8000-000000000001',repeat('f',64),gen_random_uuid(),'{"staffEntry":true,"userId":"71000000-0000-4000-8000-000000000006","nickname":"Not RSVP","practiceLanguage":"english"}'),'22023','staff cannot claim non-RSVP user');
 receipt:=arrival_submit(e,'71000000-0000-4000-8000-000000000001',repeat('f',64),gen_random_uuid(),'{"staffEntry":true,"nickname":"Walk in","practiceLanguage":"both"}');
 participant:=(receipt->'participant'->>'id')::uuid;
 PERFORM pg_temp.assert_true(receipt->'participant'->>'user_id' IS NULL,'staff walkin is not host identity');
 PERFORM pg_temp.expect_error(format('SELECT arrival_submit(%L,%L,%L,%L,%L)','73000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001',repeat('e',64),gen_random_uuid(),jsonb_build_object('staffEntry',true,'participantId',participant,'practiceLanguage','english')),'22023','foreign participant refused');
 PERFORM pg_temp.assert_true(arrival_rate_limit(repeat('1',64),2),'rate bucket first attempt');
 PERFORM pg_temp.assert_true(arrival_rate_limit(repeat('1',64),2),'rate bucket second attempt');
 PERFORM pg_temp.assert_true(NOT arrival_rate_limit(repeat('1',64),2),'rate bucket exhausted');
 UPDATE event_arrival_rate_limits SET started_at=now()-interval '11 minutes';
 PERFORM pg_temp.assert_true(arrival_rate_limit(repeat('1',64),2),'expired rate bucket resets');
END $$;
RESET ROLE;
-- Existing authenticated preorder is reused, remains editable/cancellable through legacy RPC.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true);
SELECT create_event_preorder('73000000-0000-4000-8000-000000000001','[{"item_id":"75000000-0000-4000-8000-000000000001","qty":1}]');
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE a jsonb; old_id uuid;
BEGIN
 SELECT id INTO old_id FROM event_preorders WHERE user_id='71000000-0000-4000-8000-000000000004';
 a:=arrival_submit('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000004',NULL,gen_random_uuid(),'{"nickname":"Returning","practiceLanguage":"vietnamese"}');
 PERFORM pg_temp.assert_true((a->'order'->>'id')::uuid=old_id,'existing preorder linked without duplicate');
 PERFORM pg_temp.assert_true((SELECT checked_in_at IS NOT NULL FROM rsvps WHERE user_id='71000000-0000-4000-8000-000000000004'),'existing RSVP checked in');
 PERFORM pg_temp.expect_error($s$SELECT arrival_submit('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000004',NULL,gen_random_uuid(),'{"nickname":"Returning","practiceLanguage":"vietnamese","items":[{"item_id":"75000000-0000-4000-8000-000000000001","qty":2}]}')$s$,'40001','existing preorder never silently replaced');
 PERFORM arrival_submit('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002',repeat('c',64),gen_random_uuid(),'{"staffEntry":true,"userId":"71000000-0000-4000-8000-000000000004","nickname":"Assisted","practiceLanguage":"both"}');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM event_arrival_participants WHERE user_id='71000000-0000-4000-8000-000000000004'),'staff assists same RSVP identity without duplicate');
END $$;
RESET ROLE;
ROLLBACK;
