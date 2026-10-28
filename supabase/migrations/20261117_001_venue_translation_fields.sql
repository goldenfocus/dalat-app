BEGIN;
ALTER TABLE public.content_translations DROP CONSTRAINT content_translations_field_name_check;
ALTER TABLE public.content_translations ADD CONSTRAINT content_translations_field_name_check CHECK (field_name IN (
 'title','description','text_content','bio','story_content','technical_content','meta_description',
 'image_alt','image_description','ai_description','ai_title','scene_description','video_summary','audio_summary','pdf_summary',
 'video_transcript','audio_transcript','pdf_extracted_text','content','lyrics','help_offered','help_wanted',
 'name','note','subtitle','summary','narrative','observations','photos','sponsorship','tags'
));
DROP TRIGGER invalidate_translation ON public.venues;
CREATE TRIGGER invalidate_translation AFTER UPDATE OR DELETE ON public.venues FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('venue','id','description,photos,tags');
COMMIT;
