BEGIN;
INSERT INTO auth.users(id) VALUES('99000000-0000-4000-8000-000000000001');
INSERT INTO profiles(id,username) VALUES('99000000-0000-4000-8000-000000000001','menu_sync_owner');
INSERT INTO venues(id,owner_id,preorder_enabled) VALUES('436f8b46-d5fe-41ef-8245-e8ffb9ee7980','99000000-0000-4000-8000-000000000001',true);
INSERT INTO events(id,created_by,venue_id,status,starts_at,ends_at) VALUES
 ('171fa31b-4040-4ec3-a7cf-58e6f17dc096','99000000-0000-4000-8000-000000000001','436f8b46-d5fe-41ef-8245-e8ffb9ee7980','published',now(),now()+interval '2 hours'),
 ('f60d8b07-16d9-48be-ad3a-7483de51f914','99000000-0000-4000-8000-000000000001','436f8b46-d5fe-41ef-8245-e8ffb9ee7980','published',now(),now()+interval '2 hours');
INSERT INTO event_drink_sponsors VALUES('171fa31b-4040-4ec3-a7cf-58e6f17dc096','EZViet',now()+interval '4 hours'),('f60d8b07-16d9-48be-ad3a-7483de51f914','EZViet',now()+interval '8 days');
INSERT INTO venue_menu_sections(id,venue_id,slug,title) VALUES
 ('76b3fd76-595c-4584-82c0-0ebd248f8bc8','436f8b46-d5fe-41ef-8245-e8ffb9ee7980','coffee','Coffee'),
 ('99000000-0000-4000-8000-000000000002','436f8b46-d5fe-41ef-8245-e8ffb9ee7980','food','Food');
INSERT INTO venue_menu_items(id,venue_id,section_id,name,price_vnd) VALUES('99000000-0000-4000-8000-000000000003','436f8b46-d5fe-41ef-8245-e8ffb9ee7980','76b3fd76-595c-4584-82c0-0ebd248f8bc8','New coffee',45000);
DO $$ BEGIN
 IF (SELECT count(*) FROM event_sponsored_drinks WHERE menu_item_id='99000000-0000-4000-8000-000000000003')<>2 THEN RAISE EXCEPTION 'New drink did not inherit both active campaigns'; END IF;
END $$;
UPDATE venue_menu_items SET section_id='99000000-0000-4000-8000-000000000002' WHERE id='99000000-0000-4000-8000-000000000003';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM event_sponsored_drinks WHERE menu_item_id='99000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Food still eligible'; END IF;
END $$;
UPDATE event_drink_sponsors SET ends_at=now()-interval '1 hour' WHERE event_id='171fa31b-4040-4ec3-a7cf-58e6f17dc096';
UPDATE venue_menu_items SET section_id='76b3fd76-595c-4584-82c0-0ebd248f8bc8' WHERE id='99000000-0000-4000-8000-000000000003';
DO $$ BEGIN
 IF (SELECT count(*) FROM event_sponsored_drinks WHERE menu_item_id='99000000-0000-4000-8000-000000000003')<>1 THEN RAISE EXCEPTION 'Expired campaign gained eligibility'; END IF;
END $$;
ROLLBACK;
