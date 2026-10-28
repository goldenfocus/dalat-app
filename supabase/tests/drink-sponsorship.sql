BEGIN;
INSERT INTO auth.users(id) VALUES('91000000-0000-4000-8000-000000000001'),('91000000-0000-4000-8000-000000000002'),('91000000-0000-4000-8000-000000000003');
INSERT INTO profiles(id,username) VALUES('91000000-0000-4000-8000-000000000001','sponsor_owner'),('91000000-0000-4000-8000-000000000002','sponsor_guest'),('91000000-0000-4000-8000-000000000003','sponsor_orders');
INSERT INTO venues(id,owner_id,preorder_enabled) VALUES('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',true);
INSERT INTO events(id,created_by,venue_id,status,starts_at,ends_at,arrival_enabled) VALUES('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','published',now(),now()+interval '2 hours',true);
INSERT INTO rsvps(event_id,user_id,status) VALUES('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','going');
INSERT INTO event_staff(event_id,user_id,role) VALUES('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','orders');
INSERT INTO venue_menu_sections(id,venue_id,slug,title) VALUES('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','drinks','Drinks');
INSERT INTO venue_menu_items(id,venue_id,section_id,name,price_vnd) VALUES('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','Expensive drink',110000),('95000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','Food',55000);
INSERT INTO event_drink_sponsors VALUES('93000000-0000-4000-8000-000000000001','EZViet',now()+interval '4 hours');
INSERT INTO event_sponsored_drinks VALUES('93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001');
DO $$
DECLARE event_id uuid:='93000000-0000-4000-8000-000000000001'; guest_id uuid:='91000000-0000-4000-8000-000000000002'; owner_id uuid:='91000000-0000-4000-8000-000000000001';
 payload jsonb:='{"items":[{"item_id":"95000000-0000-4000-8000-000000000001","qty":2},{"item_id":"95000000-0000-4000-8000-000000000002","qty":1}],"sponsoredItemId":"95000000-0000-4000-8000-000000000001"}';
 result jsonb; again jsonb; order_id uuid;
BEGIN
 BEGIN PERFORM arrival_reserve(event_id,NULL,gen_random_uuid(),payload); RAISE EXCEPTION 'anonymous reservation allowed'; EXCEPTION WHEN SQLSTATE '28000' THEN NULL; END;
 BEGIN PERFORM arrival_reserve(event_id,owner_id,gen_random_uuid(),payload); RAISE EXCEPTION 'non RSVP sponsor allowed'; EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'rsvp_not_found' THEN RAISE; END IF; END;
 BEGIN PERFORM arrival_reserve(event_id,guest_id,gen_random_uuid(),jsonb_set(payload,'{sponsoredItemId}','"95000000-0000-4000-8000-000000000002"')); RAISE EXCEPTION 'food sponsored'; EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'invalid_sponsor_item' THEN RAISE; END IF; END;
 result:=arrival_reserve(event_id,guest_id,'96000000-0000-4000-8000-000000000001',payload);
 again:=arrival_reserve(event_id,guest_id,'96000000-0000-4000-8000-000000000001',payload);
 IF result<>again OR (result->'order'->>'sponsored_vnd')::int<>110000 OR (result->'order'->>'total_vnd')::int<>275000 OR (result->'order'->>'guest_due_vnd')::int<>165000 OR result->'order'->>'sponsor_status'<>'reserved' THEN RAISE EXCEPTION 'incorrect snapshot or retry: %',result; END IF;
 order_id:=(result->'order'->>'id')::uuid;
 UPDATE event_staff SET role='welcome' WHERE user_id='91000000-0000-4000-8000-000000000003';
 BEGIN PERFORM arrival_submit(event_id,'91000000-0000-4000-8000-000000000003',repeat('d',64),gen_random_uuid(),jsonb_build_object('staffEntry',true,'userId',guest_id,'nickname','Staff','practiceLanguage','both','sponsoredItemId','95000000-0000-4000-8000-000000000001')); RAISE EXCEPTION 'welcome-only staff changed sponsorship'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 UPDATE event_staff SET role='orders' WHERE user_id='91000000-0000-4000-8000-000000000003';
 BEGIN PERFORM arrival_staff_action(event_id,owner_id,jsonb_build_object('action','setOrderStatus','orderId',order_id,'status','confirmed','expectedStatus','pending')); RAISE EXCEPTION 'prepared no-show'; EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'arrival_required' THEN RAISE; END IF; END;
 UPDATE rsvps SET status='cancelled' WHERE user_id=guest_id;
 BEGIN PERFORM arrival_submit(event_id,guest_id,repeat('c',64),gen_random_uuid(),'{"nickname":"Cancelled RSVP","practiceLanguage":"both"}'); RAISE EXCEPTION 'cancelled RSVP released sponsor'; EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'rsvp_not_found' THEN RAISE; END IF; END;
 UPDATE rsvps SET status='going' WHERE user_id=guest_id;
 PERFORM arrival_submit(event_id,guest_id,repeat('a',64),gen_random_uuid(),'{"nickname":"Guest","practiceLanguage":"vietnamese","englishLevel":"native","vietnameseLevel":"advanced","items":[]}');
 IF (SELECT sponsor_status FROM event_preorders WHERE id=order_id)<>'owed' THEN RAISE EXCEPTION 'arrival did not release sponsorship'; END IF;
 PERFORM arrival_staff_action(event_id,owner_id,jsonb_build_object('action','setOrderStatus','orderId',order_id,'status','fulfilled','expectedStatus','pending'));
 BEGIN PERFORM arrival_staff_action(event_id,'91000000-0000-4000-8000-000000000003',jsonb_build_object('action','settleSponsor','orderId',order_id)); RAISE EXCEPTION 'order staff settled sponsor'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM arrival_staff_action(event_id,owner_id,jsonb_build_object('action','settleSponsor','orderId',order_id));
 IF (SELECT sponsor_status FROM event_preorders WHERE id=order_id)<>'settled' OR (SELECT paid_at FROM event_preorders WHERE id=order_id) IS NOT NULL THEN RAISE EXCEPTION 'settlement changed guest payment'; END IF;
 BEGIN PERFORM arrival_reserve(event_id,guest_id,gen_random_uuid(),payload); RAISE EXCEPTION 'second sponsor allowed'; EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'sponsor_already_used' THEN RAISE; END IF; END;
 -- Cancellation and RSVP cycling never replenish the sponsored entitlement.
 UPDATE event_preorders SET status='cancelled' WHERE id=order_id;
 UPDATE rsvps SET status='cancelled' WHERE rsvps.event_id='93000000-0000-4000-8000-000000000001' AND user_id=guest_id;
 UPDATE rsvps SET status='going' WHERE rsvps.event_id='93000000-0000-4000-8000-000000000001' AND user_id=guest_id;
 BEGIN PERFORM arrival_reserve(event_id,guest_id,gen_random_uuid(),payload); RAISE EXCEPTION 'cancel and re-RSVP replenished sponsor'; EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'sponsor_already_used' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM event_drink_redemptions WHERE user_id=guest_id)<>1 THEN RAISE EXCEPTION 'redemption ledger changed'; END IF;
 -- Existing paid preorders can gain the offer at check-in without resubmitting their items.
 INSERT INTO rsvps(event_id,user_id,status) VALUES(event_id,owner_id,'going');
 result:=arrival_reserve(event_id,owner_id,gen_random_uuid(),payload-'sponsoredItemId');
 UPDATE event_preorders SET paid_at=now() WHERE id=(result->'order'->>'id')::uuid;
 BEGIN PERFORM arrival_submit(event_id,owner_id,repeat('b',64),gen_random_uuid(),'{"nickname":"Paid preorder","practiceLanguage":"both","items":[],"sponsoredItemId":"95000000-0000-4000-8000-000000000001"}'); RAISE EXCEPTION 'paid order double billed sponsor'; EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'invalid_sponsor' THEN RAISE; END IF; END;
 UPDATE event_preorders SET paid_at=NULL WHERE id=(result->'order'->>'id')::uuid;
 result:=arrival_submit(event_id,owner_id,repeat('b',64),gen_random_uuid(),'{"nickname":"Existing preorder","practiceLanguage":"both","items":[],"sponsoredItemId":"95000000-0000-4000-8000-000000000001"}');
 IF result->'order'->>'sponsor_status'<>'owed' OR (result->'order'->>'sponsored_vnd')::int<>110000 THEN RAISE EXCEPTION 'existing order sponsorship failed'; END IF;
 PERFORM arrival_staff_action(event_id,owner_id,jsonb_build_object('action','setOrderStatus','orderId',result->'order'->>'id','status','cancelled','expectedStatus','pending'));
 IF (SELECT sponsor_status FROM event_preorders WHERE id=(result->'order'->>'id')::uuid)<>'void' OR EXISTS(SELECT 1 FROM event_preorders WHERE user_id=owner_id AND sponsor_status='owed') THEN RAISE EXCEPTION 'cancelled sponsor still payable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM event_drink_redemptions WHERE user_id=owner_id) THEN RAISE EXCEPTION 'cancel deleted redemption'; END IF;
 IF has_function_privilege('authenticated','arrival_reserve(uuid,uuid,uuid,jsonb)','execute') OR has_function_privilege('service_role','arrival_apply_sponsor(uuid,uuid,uuid)','execute') THEN RAISE EXCEPTION 'helper public'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 BEGIN
  UPDATE public.event_preorders SET sponsored_vnd=total_vnd,sponsor_status='settled';
  RAISE EXCEPTION 'authenticated guest rewrote sponsored accounting';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SELECT set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 BEGIN
  UPDATE public.event_preorders SET sponsored_vnd=total_vnd,sponsor_status='settled';
  RAISE EXCEPTION 'authenticated venue editor rewrote sponsored accounting';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
