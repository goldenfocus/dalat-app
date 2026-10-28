-- Safe after installing the migration; always rolls back the isolated test fixture.
BEGIN;
DO $$
DECLARE vid uuid := gen_random_uuid(); sid uuid := gen_random_uuid(); n integer; bound text;
BEGIN
 INSERT INTO public.venues(id,slug,name,description,latitude,longitude) VALUES(vid,'translation-rehearsal-'||vid,'Translation rehearsal','Source one',11.94,108.44);
 INSERT INTO public.venue_menu_sections(id,venue_id,slug,title,title_i18n) VALUES(sid,vid,'test','Fresh soup','{"de":"Frische Suppe","fr":"Soupe fraîche"}');
 UPDATE public.venue_menu_sections SET title='Cold soup' WHERE id=sid;
 SELECT title_i18n_sources->>'de' INTO bound FROM public.venue_menu_sections WHERE id=sid AND title_i18n->>'de'='Frische Suppe';
 IF bound IS DISTINCT FROM 'Fresh soup' THEN RAISE EXCEPTION 'Stale menu edit lost its source binding or editor translation'; END IF;
 UPDATE public.venue_menu_sections SET title_i18n='{"de":"Kalte Suppe","fr":"Soupe fraîche"}' WHERE id=sid;
 SELECT title_i18n_sources->>'de' INTO bound FROM public.venue_menu_sections WHERE id=sid;
 IF bound IS DISTINCT FROM 'Cold soup' THEN RAISE EXCEPTION 'Re-reviewed menu edit did not bind to current source'; END IF;
 INSERT INTO public.content_translations(content_type,content_id,source_locale,target_locale,field_name,translated_text,translation_status) VALUES('venue',vid,'en','de','description','Quelle eins','auto'),('venue',vid,'en','fr','description','Source un','reviewed');
 UPDATE public.venues SET description='Source two' WHERE id=vid;
 SELECT count(*) INTO n FROM public.content_translations WHERE content_id=vid AND translation_status='auto';
 IF n<>0 THEN RAISE EXCEPTION 'Source edit did not invalidate auto translations'; END IF;
 SELECT count(*) INTO n FROM public.content_translations WHERE content_id=vid AND translation_status='reviewed' AND is_stale;
 IF n<>1 THEN RAISE EXCEPTION 'Human review was overwritten or stayed visible after a source edit'; END IF;
 SELECT title_i18n_sources->>'fr' INTO bound FROM public.venue_menu_sections WHERE id=sid;
 IF bound IS DISTINCT FROM 'Fresh soup' THEN RAISE EXCEPTION 'Partial locale review revived a stale language'; END IF;
 DELETE FROM public.venues WHERE id=vid;
 SELECT count(*) INTO n FROM public.content_translations WHERE content_id=vid;
 IF n<>0 THEN RAISE EXCEPTION 'Delete left orphan translations'; END IF;
END $$;
DO $$
DECLARE eid uuid := gen_random_uuid(); owner_id uuid;
BEGIN
 SELECT id INTO owner_id FROM public.profiles LIMIT 1;
 INSERT INTO public.events(id,slug,title,starts_at,created_by,status) VALUES(eid,'translation-visibility-'||eid,'Translation visibility fixture',now()+interval '1 day',owner_id,'published');
 INSERT INTO public.content_translations(content_type,content_id,source_locale,target_locale,field_name,translated_text,translation_status) VALUES('event',eid,'en','de','title','Sichtbarkeitstest','auto');
 PERFORM set_config('translation.test_event_id',eid::text,true);
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.content_translations WHERE content_id=current_setting('translation.test_event_id')::uuid)<>1 THEN RAISE EXCEPTION 'Public event translation is unreadable'; END IF;
END $$;
RESET ROLE;
UPDATE public.events SET status='draft' WHERE id=current_setting('translation.test_event_id')::uuid;
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.content_translations WHERE content_id=current_setting('translation.test_event_id')::uuid) THEN RAISE EXCEPTION 'Unpublished event translation remained publicly readable'; END IF;
END $$;
RESET ROLE;
DO $$
DECLARE eid uuid := gen_random_uuid(); mid uuid := gen_random_uuid(); owner_id uuid; col text;
BEGIN
 SELECT id INTO owner_id FROM public.profiles LIMIT 1;
 INSERT INTO public.events(id,slug,title,starts_at,created_by,status) VALUES(eid,'translation-labels-'||eid,'Translation label fixture',now()+interval '1 day',owner_id,'published');
 INSERT INTO public.moments(id,event_id,user_id,content_type,text_content,status) VALUES(mid,eid,owner_id,'text','Source caption','published');
 INSERT INTO public.moment_metadata(moment_id,ai_tags,processing_status) VALUES(mid,ARRAY['coffee'],'completed');
 INSERT INTO public.content_translations(content_type,content_id,source_locale,target_locale,field_name,translated_text,translation_status) VALUES('moment',mid,'en','fr','tags','["café"]','reviewed');
 FOREACH col IN ARRAY ARRAY['ai_tags','detected_objects','location_hints','detected_text','mood'] LOOP
   INSERT INTO public.content_translations(content_type,content_id,source_locale,target_locale,field_name,translated_text,translation_status) VALUES('moment',mid,'en','de','tags','["Kaffee"]','auto');
   UPDATE public.content_translations SET is_stale=false WHERE content_id=mid AND target_locale='fr';
   IF col='mood' THEN
     UPDATE public.moment_metadata SET mood='welcoming' WHERE moment_id=mid;
   ELSE
     EXECUTE format('UPDATE public.moment_metadata SET %I=ARRAY[$1] WHERE moment_id=$2',col) USING 'Updated '||col,mid;
   END IF;
   IF EXISTS(SELECT 1 FROM public.content_translations WHERE content_id=mid AND translation_status='auto') THEN RAISE EXCEPTION 'Metadata label edit did not invalidate %',col; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.content_translations WHERE content_id=mid AND target_locale='fr' AND translation_status='reviewed' AND is_stale AND translated_text='["café"]') THEN RAISE EXCEPTION 'Metadata label edit damaged or revived human review for %',col; END IF;
 END LOOP;
END $$;
ROLLBACK;
