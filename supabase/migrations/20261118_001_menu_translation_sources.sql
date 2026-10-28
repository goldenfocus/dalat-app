BEGIN;
-- Preserve editor locale overrides, but bind them to the exact source revision.
ALTER TABLE public.venue_menu_items ADD COLUMN name_i18n_source text, ADD COLUMN description_i18n_source text;
ALTER TABLE public.venue_menu_sections ADD COLUMN title_i18n_source text, ADD COLUMN note_i18n_source text;
UPDATE public.venue_menu_items SET name_i18n_source=name,description_i18n_source=description;
UPDATE public.venue_menu_sections SET title_i18n_source=title,note_i18n_source=note;
CREATE FUNCTION public.bind_menu_translation_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE field text; patch jsonb := '{}'::jsonb;
BEGIN
 FOREACH field IN ARRAY string_to_array(TG_ARGV[0],',') LOOP
  IF TG_OP='INSERT' OR to_jsonb(NEW)->(field||'_i18n') IS DISTINCT FROM to_jsonb(OLD)->(field||'_i18n') THEN
   patch := patch || jsonb_build_object(field||'_i18n_source',to_jsonb(NEW)->field);
  END IF;
 END LOOP;
 NEW := jsonb_populate_record(NEW,patch);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bind_menu_translation_source() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bind_translation_source BEFORE INSERT OR UPDATE ON public.venue_menu_items FOR EACH ROW EXECUTE FUNCTION public.bind_menu_translation_source('name,description');
CREATE TRIGGER bind_translation_source BEFORE INSERT OR UPDATE ON public.venue_menu_sections FOR EACH ROW EXECUTE FUNCTION public.bind_menu_translation_source('title,note');
COMMIT;
