-- Disposable database only; no fixture survives this transaction.
BEGIN;
INSERT INTO auth.users(id) SELECT ('aa000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,101)n;
INSERT INTO profiles(id,username) SELECT id,'offer_'||right(id::text,12) FROM auth.users WHERE id::text LIKE 'aa000000%';
INSERT INTO venues(id,owner_id,preorder_enabled) VALUES('ab000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',true);
INSERT INTO event_series(id,slug,arrival_enabled) VALUES('ac000000-0000-4000-8000-000000000001','offer-series',true);
INSERT INTO venue_menu_sections(id,venue_id,slug,title) VALUES('ad000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001','coffee','Coffee');
INSERT INTO venue_menu_items(id,venue_id,section_id,name,price_vnd) VALUES('ae000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001','Coffee',45000);
INSERT INTO series_drink_sponsors VALUES('ac000000-0000-4000-8000-000000000001','EZViet',100);
INSERT INTO series_sponsored_drink_sections VALUES('ac000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001');
INSERT INTO events(id,created_by,series_id,venue_id,status,starts_at,ends_at,ai_tags) VALUES('af000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001','published',now(),now()+interval '2 hours',ARRAY['language-exchange']);
INSERT INTO rsvps(event_id,user_id,status,created_at) SELECT 'af000000-0000-4000-8000-000000000001',('aa000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'going',now()+n*interval '1 second' FROM generate_series(1,101)n ORDER BY n;
DO $$
DECLARE e uuid:='af000000-0000-4000-8000-000000000001'; u100 uuid:='aa000000-0000-4000-8000-000000000100'; u101 uuid:='aa000000-0000-4000-8000-000000000101';
 payload jsonb:='{"items":[{"item_id":"ae000000-0000-4000-8000-000000000001","qty":1}],"sponsoredItemId":"ae000000-0000-4000-8000-000000000001"}'; result jsonb;
BEGIN
 IF NOT (SELECT arrival_enabled FROM events WHERE id=e) THEN RAISE EXCEPTION 'Tag did not enable RSVP flow'; END IF;
 IF (SELECT rsvp_limit FROM event_drink_sponsors WHERE event_id=e)<>100 OR NOT EXISTS(SELECT 1 FROM event_sponsored_drinks WHERE event_id=e) THEN RAISE EXCEPTION 'Series offer not inherited'; END IF;
 IF NOT (arrival_sponsor_eligibility(e,u100)->>'eligible')::boolean OR (arrival_sponsor_eligibility(e,u101)->>'eligible')::boolean THEN RAISE EXCEPTION '100/101 boundary failed'; END IF;
 result:=arrival_reserve(e,u100,gen_random_uuid(),payload);
 IF (result->'order'->>'guest_due_vnd')::integer<>0 THEN RAISE EXCEPTION '100th RSVP was charged'; END IF;
 BEGIN PERFORM arrival_reserve(e,u101,gen_random_uuid(),payload); RAISE EXCEPTION '101st RSVP got free drink'; EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'sponsor_limit_reached' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM event_preorders WHERE event_id=e AND user_id=u101) THEN RAISE EXCEPTION 'Failed free request left an order'; END IF;
 result:=arrival_reserve(e,u101,gen_random_uuid(),payload-'sponsoredItemId');
 IF (result->'order'->>'guest_due_vnd')::integer<>45000 THEN RAISE EXCEPTION '101st RSVP cannot place paid order'; END IF;
 UPDATE rsvps SET status='cancelled' WHERE event_id=e AND user_id=u100;
 UPDATE rsvps SET status='going' WHERE event_id=e AND user_id=u100;
 IF (arrival_sponsor_eligibility(e,u100)->>'position')::integer<>100 THEN RAISE EXCEPTION 'Rejoin reset position'; END IF;
 PERFORM set_event_drink_limit(e,'aa000000-0000-4000-8000-000000000001',10);
 IF (arrival_sponsor_eligibility(e,'aa000000-0000-4000-8000-000000000011')->>'eligible')::boolean THEN RAISE EXCEPTION 'Limit update ignored'; END IF;
 IF (SELECT sponsored_vnd FROM event_preorders WHERE event_id=e AND user_id=u100)<>45000 THEN RAISE EXCEPTION 'Existing free order revoked'; END IF;
 BEGIN PERFORM set_event_drink_limit(e,u101,1000); RAISE EXCEPTION 'Guest changed limit'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_event_drink_limit(e,'aa000000-0000-4000-8000-000000000001',0);
 IF (arrival_sponsor_eligibility(e,'aa000000-0000-4000-8000-000000000001')->>'eligible')::boolean THEN RAISE EXCEPTION 'Disabled offer remains eligible'; END IF;
 IF has_table_privilege('authenticated','language_exchange_rsvp_positions','SELECT') OR has_function_privilege('authenticated','arrival_sponsor_eligibility(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private ranks exposed'; END IF;
END $$;
-- All future occurrences inherit the same setup, without granting free drinks to other venues.
INSERT INTO events(id,series_id,venue_id,status,starts_at,ends_at) VALUES('af000000-0000-4000-8000-000000000002','ac000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001','published',now()+interval '7 days',now()+interval '7 days 2 hours');
INSERT INTO events(id,status,starts_at,ai_tags) VALUES('af000000-0000-4000-8000-000000000003','published',now(),ARRAY['language-exchange']);
DO $$ BEGIN
 IF (SELECT rsvp_limit FROM event_drink_sponsors WHERE event_id='af000000-0000-4000-8000-000000000002')<>100 THEN RAISE EXCEPTION 'Future occurrence limit missing'; END IF;
 IF NOT (SELECT arrival_enabled FROM events WHERE id='af000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Other tagged language event missing flow'; END IF;
 IF EXISTS(SELECT 1 FROM event_drink_sponsors WHERE event_id='af000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Tag promised unconfigured free drinks'; END IF;
END $$;
UPDATE events SET ai_tags=ARRAY['meetup'] WHERE id='af000000-0000-4000-8000-000000000003';
DO $$ BEGIN
 IF (SELECT arrival_enabled FROM events WHERE id='af000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Removing tag did not disable language flow'; END IF;
END $$;
ROLLBACK;
