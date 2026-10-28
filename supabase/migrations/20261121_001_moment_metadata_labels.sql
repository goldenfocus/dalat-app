BEGIN;
-- Public AI labels and OCR prose share one ordered JSON-string-array translation.
-- Hex colors, model scores and private operational fields are never translated.
DROP TRIGGER invalidate_caption_translation ON public.moment_metadata;
CREATE TRIGGER invalidate_caption_translation AFTER UPDATE OR DELETE ON public.moment_metadata
FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations(
 'moment','moment_id','ai_description,ai_title,scene_description,video_summary,video_transcript,audio_summary,audio_transcript,pdf_summary,pdf_extracted_text,ai_tags,detected_objects,location_hints,mood,detected_text'
);
COMMIT;
