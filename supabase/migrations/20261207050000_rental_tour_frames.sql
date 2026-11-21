BEGIN;

ALTER TABLE public.rental_listings
  ADD COLUMN tour_frames jsonb CHECK (
    tour_frames IS NULL OR CASE WHEN jsonb_typeof(tour_frames) = 'array' THEN
      jsonb_array_length(tour_frames) BETWEEN 1 AND 12
      AND octet_length(tour_frames::text) <= 12000
      AND NOT jsonb_path_exists(tour_frames, 'strict $[*] ? (
        @.type() != "object" || !(exists(@.src)) || @.src.type() != "string"
        || !(@.src like_regex "^(/rentals/king-paradise/(photo-[1-6][.]webp|reel[.]mp4)|/api/rentals/(photos/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp|videos/[0-9a-f]{32}))$")
        || !(exists(@.caption)) || @.caption.type() != "string" || @.caption like_regex "^.{181}" flag "s"
      )')
    ELSE false END
  ),
  ADD COLUMN tour_captions jsonb GENERATED ALWAYS AS (
    jsonb_path_query_array(tour_frames, '$[*].caption ? (@ != "")')
  ) STORED;

CREATE FUNCTION rental_private.prune_tour_media()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF jsonb_typeof(NEW.tour_frames) = 'array' THEN
    -- Media can also be removed through the ordinary listing editor.
    SELECT jsonb_agg(frame ORDER BY position) INTO NEW.tour_frames
    FROM jsonb_array_elements(NEW.tour_frames) WITH ORDINALITY AS frames(frame, position)
    WHERE frame->>'src' = ANY (NEW.photos)
       OR (frame->>'src' LIKE '/api/rentals/videos/%'
         AND substring(frame->>'src' FROM length('/api/rentals/videos/') + 1) = ANY (NEW.videos))
       OR (NEW.id = 'c7725f24-49f5-469f-b95f-417b7e5ec3d3'
         AND frame->>'src' = '/rentals/king-paradise/reel.mp4');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION rental_private.prune_tour_media() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rental_tour_media BEFORE UPDATE OF tour_frames, photos, videos ON public.rental_listings
  FOR EACH ROW EXECUTE FUNCTION rental_private.prune_tour_media();

GRANT UPDATE (tour_frames) ON public.rental_listings TO authenticated;

ALTER TABLE public.content_translations DROP CONSTRAINT IF EXISTS content_translations_field_name_check;
ALTER TABLE public.content_translations ADD CONSTRAINT content_translations_field_name_check CHECK (field_name IN (
 'title','description','text_content','bio','story_content','technical_content','meta_description',
 'image_alt','image_description','ai_description','ai_title','scene_description','video_summary','audio_summary','pdf_summary',
 'video_transcript','audio_transcript','pdf_extracted_text','content','lyrics','help_offered','help_wanted',
 'name','note','subtitle','summary','narrative','observations','photos','sponsorship','tags','tour_captions'
));

DROP TRIGGER invalidate_rental_translation ON public.rental_listings;
CREATE TRIGGER invalidate_rental_translation AFTER UPDATE OR DELETE ON public.rental_listings
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations(
    'rental', 'id', 'title,description,source_locale,status,tags,tour_captions'
  );

ALTER POLICY rental_translation_read ON public.content_translations
  USING (content_type = 'rental' AND NOT is_stale AND field_name IN ('title','description','tags','tour_captions')
    AND EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id=content_id AND l.status='published'));

COMMIT;
