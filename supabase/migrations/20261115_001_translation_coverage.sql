BEGIN;
ALTER TABLE public.content_translations ADD COLUMN is_stale boolean NOT NULL DEFAULT false;
-- Public content families shared by the local subscription translator and readers.
ALTER TABLE public.content_translations DROP CONSTRAINT content_translations_content_type_check;
ALTER TABLE public.content_translations ADD CONSTRAINT content_translations_content_type_check CHECK (content_type IN (
 'event','moment','profile','blog','venue','comment','organizer','track','people',
 'experience','tribe','festival','menu_item','menu_section'
));
ALTER TABLE public.content_translations DROP CONSTRAINT content_translations_field_name_check;
ALTER TABLE public.content_translations ADD CONSTRAINT content_translations_field_name_check CHECK (field_name IN (
 'title','description','text_content','bio','story_content','technical_content','meta_description',
 'image_alt','image_description','ai_description','ai_title','scene_description','video_summary','audio_summary','pdf_summary',
 'video_transcript','audio_transcript','pdf_extracted_text','content','lyrics','help_offered','help_wanted',
 'name','note','subtitle','summary','narrative','observations','photos','sponsorship'
));

-- Reads for newly supported families follow their source visibility, including after unpublishing.
DROP POLICY translations_select_public ON public.content_translations;
CREATE POLICY translations_select_public ON public.content_translations FOR SELECT USING (
 NOT is_stale AND CASE
 WHEN content_type='people' THEN public.can_view_people_profile(content_id)
 WHEN content_type='profile' THEN content_id=auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=content_id AND NOT p.is_private)
 WHEN content_type='experience' THEN EXISTS (SELECT 1 FROM public.experiences e WHERE e.id=content_id AND e.status='published')
 WHEN content_type='tribe' THEN EXISTS (SELECT 1 FROM public.tribes t WHERE t.id=content_id AND t.is_listed AND t.access_type IN ('public','request'))
 WHEN content_type='menu_item' THEN EXISTS (SELECT 1 FROM public.venue_menu_items i WHERE i.id=content_id AND i.is_available)
 WHEN content_type='menu_section' THEN EXISTS (SELECT 1 FROM public.venue_menu_sections s WHERE s.id=content_id AND s.is_visible)
 WHEN content_type='festival' THEN EXISTS (SELECT 1 FROM public.festivals f WHERE f.id=content_id)
 ELSE true END
);

-- Any database writer (admin, import, CLI, browser, future feature) invalidates changed automatic text.
-- The source write and invalidation commit together; browser callbacks are only an optimization.
CREATE FUNCTION public.invalidate_changed_content_translations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE field text; changed boolean := false; source_id uuid;
BEGIN
 source_id := (to_jsonb(OLD)->>TG_ARGV[1])::uuid;
 IF TG_OP='DELETE' THEN
   DELETE FROM public.content_translations WHERE content_type=TG_ARGV[0] AND content_id=source_id;
   RETURN OLD;
 END IF;
 FOREACH field IN ARRAY string_to_array(TG_ARGV[2],',') LOOP
   IF to_jsonb(NEW)->field IS DISTINCT FROM to_jsonb(OLD)->field THEN changed := true; EXIT; END IF;
 END LOOP;
 IF changed THEN
   DELETE FROM public.content_translations WHERE content_type=TG_ARGV[0] AND content_id=source_id AND translation_status='auto';
   UPDATE public.content_translations SET is_stale=true WHERE content_type=TG_ARGV[0] AND content_id=source_id AND translation_status<>'auto';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_changed_content_translations() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.venues FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('venue','id','description');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.organizers FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('organizer','id','description');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.tribes FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('tribe','id','description,is_listed,access_type');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.experiences FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('experience','id','title,summary,narrative,observations,photos,sponsorship,status');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.venue_menu_items FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('menu_item','id','name,description,is_available');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.venue_menu_sections FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('menu_section','id','title,note,is_visible');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.festivals FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('festival','id','title,subtitle,description');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('comment','id','content,is_hidden,is_deleted');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('event','id','title,description,image_alt,image_description');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.moments FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('moment','id','text_content');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('profile','id','bio,is_private');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('blog','id','title,story_content,technical_content,meta_description');
CREATE TRIGGER invalidate_caption_translation AFTER UPDATE OR DELETE ON public.moment_metadata FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('moment','moment_id','ai_description,ai_title,scene_description,video_summary,video_transcript,audio_summary,audio_transcript,pdf_summary,pdf_extracted_text');
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.playlist_tracks FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('track','id','lyrics_lrc');
COMMIT;
