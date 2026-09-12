BEGIN;
ALTER TABLE public.tribes ADD COLUMN short_slug text UNIQUE CHECK(short_slug ~ '^[a-z0-9][a-z0-9-]{2,59}$');
ALTER TABLE public.unified_slugs DROP CONSTRAINT unified_slugs_entity_type_check;
ALTER TABLE public.unified_slugs ADD CONSTRAINT unified_slugs_entity_type_check CHECK(entity_type IN ('venue','organizer','profile','community'));
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM unified_slugs WHERE slug='communities') THEN RAISE EXCEPTION 'Community route conflicts with an existing handle'; END IF;
 INSERT INTO reserved_slugs(slug,reason) VALUES('communities','Community route') ON CONFLICT DO NOTHING;
END $$;
-- Short handles are provisioned separately, after checking the shared namespace.
-- Ordinary community edits cannot claim an existing person or venue URL.
CREATE FUNCTION public.guard_community_handle() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin','service_role') AND ((TG_OP='INSERT' AND NEW.short_slug IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.short_slug IS DISTINCT FROM OLD.short_slug)) THEN RAISE EXCEPTION 'Short handle provisioning requires an administrator' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_community_handle BEFORE INSERT OR UPDATE ON public.tribes FOR EACH ROW EXECUTE FUNCTION public.guard_community_handle();
CREATE FUNCTION public.sync_community_handle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  DELETE FROM reserved_slugs WHERE slug IN (SELECT slug FROM unified_slugs WHERE entity_type='community' AND entity_id=OLD.id) AND reason='Community short handle';
  DELETE FROM unified_slugs WHERE entity_type='community' AND entity_id=OLD.id;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND NEW.short_slug IS NOT DISTINCT FROM OLD.short_slug THEN RETURN NEW; END IF;
 IF NEW.short_slug IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM reserved_slugs WHERE slug=NEW.short_slug) OR EXISTS(SELECT 1 FROM unified_slugs WHERE slug=NEW.short_slug) OR EXISTS(SELECT 1 FROM profiles WHERE lower(username)=NEW.short_slug) OR EXISTS(SELECT 1 FROM venues WHERE lower(slug)=NEW.short_slug) OR EXISTS(SELECT 1 FROM organizers WHERE lower(slug)=NEW.short_slug) THEN RAISE EXCEPTION 'Short handle already in use'; END IF;
 END IF;
 UPDATE unified_slugs SET is_primary=false WHERE entity_type='community' AND entity_id=NEW.id;
 IF NEW.short_slug IS NOT NULL THEN
  INSERT INTO unified_slugs(slug,entity_type,entity_id,is_primary) VALUES(NEW.short_slug,'community',NEW.id,true);
  INSERT INTO reserved_slugs(slug,reason) VALUES(NEW.short_slug,'Community short handle');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_community_handle AFTER INSERT OR UPDATE OF short_slug OR DELETE ON public.tribes FOR EACH ROW EXECUTE FUNCTION public.sync_community_handle();
COMMIT;
