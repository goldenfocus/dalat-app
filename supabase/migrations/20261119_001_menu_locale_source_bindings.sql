BEGIN;
-- A partial locale review must not revive stale translations in other languages.
ALTER TABLE public.venue_menu_items ADD COLUMN name_i18n_sources jsonb NOT NULL DEFAULT '{}', ADD COLUMN description_i18n_sources jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.venue_menu_sections ADD COLUMN title_i18n_sources jsonb NOT NULL DEFAULT '{}', ADD COLUMN note_i18n_sources jsonb NOT NULL DEFAULT '{}';
UPDATE public.venue_menu_items SET name_i18n_sources=coalesce((SELECT jsonb_object_agg(key,name_i18n_source) FROM jsonb_each(name_i18n)),'{}'), description_i18n_sources=coalesce((SELECT jsonb_object_agg(key,description_i18n_source) FROM jsonb_each(description_i18n)),'{}');
UPDATE public.venue_menu_sections SET title_i18n_sources=coalesce((SELECT jsonb_object_agg(key,title_i18n_source) FROM jsonb_each(title_i18n)),'{}'), note_i18n_sources=coalesce((SELECT jsonb_object_agg(key,note_i18n_source) FROM jsonb_each(note_i18n)),'{}');
CREATE OR REPLACE FUNCTION public.bind_menu_translation_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE field text; locale text; bindings jsonb; patch jsonb := '{}'::jsonb; old_row jsonb;
BEGIN
 old_row := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 FOREACH field IN ARRAY string_to_array(TG_ARGV[0],',') LOOP
  bindings := '{}'::jsonb;
  FOR locale IN SELECT jsonb_object_keys(coalesce(to_jsonb(NEW)->(field||'_i18n'),'{}')) LOOP
   bindings := bindings || jsonb_build_object(locale,CASE
    WHEN TG_OP='INSERT' OR to_jsonb(NEW)->(field||'_i18n')->locale IS DISTINCT FROM old_row->(field||'_i18n')->locale
    THEN to_jsonb(NEW)->field ELSE old_row->(field||'_i18n_sources')->locale END);
  END LOOP;
  patch := patch || jsonb_build_object(field||'_i18n_sources',bindings);
 END LOOP;
 NEW := jsonb_populate_record(NEW,patch);
 RETURN NEW;
END $$;
COMMIT;
