BEGIN;
INSERT INTO auth.users(id) VALUES('ca000000-0000-4000-8000-000000000001');
INSERT INTO profiles(id,username) VALUES('ca000000-0000-4000-8000-000000000001','menu_options_test');
INSERT INTO venues(id,owner_id,preorder_enabled) VALUES('cb000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001',true);
INSERT INTO events(id,created_by,venue_id,status,starts_at,ends_at,arrival_enabled) VALUES('cc000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000001','published',now(),now()+interval '2 hours',true);
INSERT INTO rsvps(event_id,user_id,status) VALUES('cc000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','going');
INSERT INTO event_drink_sponsors(event_id,sponsor_name,ends_at,rsvp_limit) VALUES('cc000000-0000-4000-8000-000000000001','EZViet',now()+interval '2 hours',100);
INSERT INTO venue_menu_sections(id,venue_id,slug,title) VALUES('cd000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000001','coffee','Coffee');
INSERT INTO venue_menu_items(id,venue_id,section_id,name,price_vnd,option_groups) VALUES('ce000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000001','Coffee',40000,'[{"id":"temperature","choices":[{"id":"hot","price_vnd":0},{"id":"iced","price_vnd":0}]},{"id":"milk","choices":[{"id":"standard","price_vnd":0},{"id":"oat","price_vnd":5000}]}]');
INSERT INTO event_sponsored_drinks(event_id,menu_item_id) VALUES('cc000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001');
DO $$ DECLARE response jsonb; order_id uuid; payload jsonb:='{"items":[{"item_id":"ce000000-0000-4000-8000-000000000001","qty":1,"selected_options":{"temperature":"iced","milk":"oat"}},{"item_id":"ce000000-0000-4000-8000-000000000001","qty":1,"selected_options":{"temperature":"hot","milk":"standard"}}],"sponsoredItemId":"ce000000-0000-4000-8000-000000000001"}'; BEGIN
 response:=arrival_reserve('cc000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001',payload);
 order_id:=(response->'order'->>'id')::uuid;
 IF (response->'order'->>'total_vnd')::int<>85000 OR (response->'order'->>'sponsored_vnd')::int<>40000 OR (response->'order'->>'guest_due_vnd')::int<>45000 THEN RAISE EXCEPTION 'Bad option/sponsor totals: %',response; END IF;
 IF NOT EXISTS(SELECT 1 FROM event_preorder_items WHERE preorder_id=order_id AND name_snapshot='Coffee · Iced · Oat milk' AND unit_price_vnd=45000 AND selected_options->>'milk'='oat') THEN RAISE EXCEPTION 'Lost selections on receipt'; END IF;
 IF arrival_reserve('cc000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001',payload) IS DISTINCT FROM response THEN RAISE EXCEPTION 'Retry changed receipt'; END IF;
 BEGIN
  PERFORM resolve_menu_options('ce000000-0000-4000-8000-000000000001','{"temperature":"iced","milk":"almond"}');
  RAISE EXCEPTION 'Unsupported milk accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM resolve_menu_options('ce000000-0000-4000-8000-000000000001','{}');
  RAISE EXCEPTION 'Missing temperature accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- Changing a selection is not an idempotent replay of the existing order.
 BEGIN
  PERFORM arrival_reserve('cc000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000002',jsonb_set(payload,'{items,0,selected_options,temperature}','"hot"'));
  RAISE EXCEPTION 'Different selections accepted as existing order';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
-- A second guest checks in with an explicitly configured coffee.
DO $$ DECLARE response jsonb; BEGIN
 response:=arrival_submit('cc000000-0000-4000-8000-000000000001',NULL,repeat('c',64),'cf000000-0000-4000-8000-000000000003','{"nickname":"Options guest","practiceLanguage":"both","items":[{"item_id":"ce000000-0000-4000-8000-000000000001","qty":2,"selected_options":{"temperature":"iced","milk":"oat"}}]}');
 IF (response->'order'->>'total_vnd')::int<>90000 THEN RAISE EXCEPTION 'Arrival price wrong: %',response; END IF;
 IF response->'order'->'items'->0->>'name_snapshot'<>'Coffee · Iced · Oat milk' THEN RAISE EXCEPTION 'Arrival options lost'; END IF;
END $$;
ROLLBACK;
