ALTER TABLE public.rental_listings
  ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 160000
  ),
  ADD COLUMN tags jsonb GENERATED ALWAYS AS (jsonb_path_query_array(details, '$.custom[*].label')) STORED;

GRANT INSERT (details), UPDATE (details) ON public.rental_listings TO authenticated;

DROP TRIGGER invalidate_rental_translation ON public.rental_listings;
CREATE TRIGGER invalidate_rental_translation AFTER UPDATE OR DELETE ON public.rental_listings
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations(
    'rental', 'id', 'title,description,source_locale,status,tags'
  );

ALTER POLICY rental_translation_read ON public.content_translations
  USING (content_type = 'rental' AND NOT is_stale AND field_name IN ('title','description','tags')
    AND EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id=content_id AND l.status='published'));

-- The first listing previously displayed these details from a hard-coded catalog.
UPDATE public.rental_listings SET details = '{
  "amenities":["wifi"], "area":["quiet"],
  "utilities":{"cleaning":"notIncluded","electricity":"notIncluded","water":"included"},
  "rules":{"dogs":"notAllowed","parties":"notAllowed"}, "minimumChildAge":12,
  "custom":[
    {"group":"amenities","label":"Yoga mat"},
    {"group":"amenities","label":"Sandals"},
    {"group":"amenities","label":"Water filter"},
    {"group":"area","label":"Top of the hilla"},
    {"group":"nearby","label":"Waterfalls and hiking"},
    {"group":"nearby","label":"Cafe"},
    {"group":"rules","label":"No drugs"}
  ]
}'::jsonb
WHERE id = 'c7725f24-49f5-469f-b95f-417b7e5ec3d3' AND details = '{}'::jsonb;
