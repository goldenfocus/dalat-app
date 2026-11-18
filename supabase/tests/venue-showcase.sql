BEGIN;
INSERT INTO venues(id,slug) VALUES ('436f8b46-d5fe-41ef-8245-e8ffb9ee7980','social-house-dalat');
INSERT INTO event_series VALUES ('ad0a0c5e-f718-447c-89f1-6fa3b78e3c52','wednesdays','FREQ=WEEKLY;BYDAY=WE');
INSERT INTO events(id,slug,title,venue_id,series_id,status,starts_at)
SELECT gen_random_uuid(),'weekly-'||i,'Weekly','436f8b46-d5fe-41ef-8245-e8ffb9ee7980','ad0a0c5e-f718-447c-89f1-6fa3b78e3c52','published',now()+i*interval '7 days' FROM generate_series(1,20) i;
INSERT INTO events VALUES(gen_random_uuid(),'one-off','One off',null,now()+interval '8 days',null,null,'436f8b46-d5fe-41ef-8245-e8ffb9ee7980',null,'published',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM get_venue_upcoming_events('436f8b46-d5fe-41ef-8245-e8ffb9ee7980')) <> 2 THEN RAISE EXCEPTION 'Recurring dates hid a separate event'; END IF;
END $$;
-- A repeat refresh preserves IDs, availability and explicit owner prices.
DO $$ DECLARE source jsonb; first_id uuid; refreshed jsonb; BEGIN
 SELECT jsonb_build_array(jsonb_build_object('slug','coffee','title','Coffee','sort',0,'items',jsonb_agg(jsonb_build_object('key','coffee/'||i,'name','Coffee '||i,'previousName','Coffee '||i,'price',40000,'description',null,'option_groups','[]'::jsonb,'tags','[]'::jsonb)))) INTO source FROM generate_series(1,35) i;
 -- Parser requires several categories in production; construct 5 distinct ones.
 source := source || '[{"slug":"a","title":"A","sort":1,"items":[]},{"slug":"b","title":"B","sort":2,"items":[]},{"slug":"c","title":"C","sort":3,"items":[]},{"slug":"d","title":"D","sort":4,"items":[]}]'::jsonb;
 PERFORM sync_official_venue_menu('436f8b46-d5fe-41ef-8245-e8ffb9ee7980',source);
 SELECT id INTO first_id FROM venue_menu_items WHERE source_key='coffee/1';
 UPDATE venue_menu_items SET is_sold_out=true,price_vnd=45000 WHERE id=first_id;
 -- A public URL rename must not disconnect the official menu source.
 UPDATE venues SET slug='socialhouse-dalat' WHERE id='436f8b46-d5fe-41ef-8245-e8ffb9ee7980';
 refreshed:=jsonb_set(source,'{0,items,0,price}','42000'::jsonb);
 PERFORM sync_official_venue_menu('436f8b46-d5fe-41ef-8245-e8ffb9ee7980',refreshed);
 IF NOT EXISTS(SELECT 1 FROM venue_menu_items WHERE id=first_id AND price_vnd=45000 AND is_sold_out) THEN RAISE EXCEPTION 'Refresh changed owner override'; END IF;
 IF (SELECT count(*) FROM venue_menu_items)<>35 THEN RAISE EXCEPTION 'Refresh duplicated items'; END IF;
 IF has_function_privilege('anon','sync_official_venue_menu(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Public menu write allowed'; END IF;
END $$;
ROLLBACK;
