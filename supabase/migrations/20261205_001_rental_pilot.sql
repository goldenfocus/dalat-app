BEGIN;

CREATE TABLE public.rental_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (length(description) <= 8000),
  source_locale text NOT NULL CHECK (source_locale IN ('en','vi','ko','zh','ru','fr','ja','ms','th','de','es','id')),
  monthly_rent integer NOT NULL CHECK (monthly_rent BETWEEN 1 AND 1000000000),
  six_month_rent integer CHECK (six_month_rent BETWEEN 1 AND 1000000000),
  yearly_rent integer CHECK (yearly_rent BETWEEN 1 AND 1000000000),
  photos text[] NOT NULL DEFAULT '{}' CHECK (cardinality(photos) <= 6),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rental_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  starts_at timestamptz NOT NULL,
  UNIQUE (host_id, starts_at)
);

CREATE TABLE public.rental_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.rental_listings(id),
  slot_id uuid REFERENCES public.rental_slots(id),
  renter_id uuid NOT NULL REFERENCES public.profiles(id),
  starts_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','proposed','confirmed','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rental_one_active_visit_per_slot ON public.rental_visits(slot_id)
  WHERE slot_id IS NOT NULL AND status IN ('pending','proposed','confirmed');
CREATE UNIQUE INDEX rental_one_active_visit_per_renter ON public.rental_visits(listing_id, renter_id)
  WHERE status IN ('pending','proposed','confirmed');
CREATE INDEX rental_visits_renter_history ON public.rental_visits(renter_id, created_at DESC);
CREATE INDEX rental_listings_host ON public.rental_listings(host_id);

ALTER TABLE public.rental_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_listings, public.rental_slots, public.rental_visits FROM anon, authenticated;
GRANT SELECT ON public.rental_listings TO anon, authenticated, service_role;
GRANT INSERT (title,description,source_locale,monthly_rent,six_month_rent,yearly_rent,photos,status),
  UPDATE (title,description,source_locale,monthly_rent,six_month_rent,yearly_rent,photos,status)
  ON public.rental_listings TO authenticated;
GRANT SELECT ON public.rental_visits, public.rental_slots TO authenticated;
GRANT INSERT (starts_at) ON public.rental_slots TO authenticated;

CREATE POLICY rental_listing_read ON public.rental_listings FOR SELECT TO anon, authenticated
  USING (status = 'published' OR host_id = (select auth.uid()));
CREATE FUNCTION public.rental_photos_owned(photos text[], owner uuid, listing uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM unnest(photos) p
    WHERE p IS NULL OR NOT (
      p ~ ('^/api/rentals/photos/' || owner::text || '/[a-f0-9-]{36}[.]webp$')
      OR (listing = 'c7725f24-49f5-469f-b95f-417b7e5ec3d3' AND p ~ '^/rentals/king-paradise/photo-[1-6][.]webp$')
    )
  );
$$;
REVOKE ALL ON FUNCTION public.rental_photos_owned(text[],uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_photos_owned(text[],uuid,uuid) TO authenticated;

CREATE POLICY rental_listing_insert ON public.rental_listings FOR INSERT TO authenticated
  WITH CHECK (host_id = (select auth.uid()) AND public.rental_photos_owned(photos,host_id,id));
CREATE POLICY rental_listing_update ON public.rental_listings FOR UPDATE TO authenticated
  USING (host_id = (select auth.uid())) WITH CHECK (host_id = (select auth.uid()) AND public.rental_photos_owned(photos,host_id,id));
CREATE POLICY rental_slot_owner_read ON public.rental_slots FOR SELECT TO authenticated
  USING (host_id = (select auth.uid()));
CREATE POLICY rental_slot_owner_insert ON public.rental_slots FOR INSERT TO authenticated
  WITH CHECK (host_id = (select auth.uid()) AND starts_at > now() AND
    EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.host_id = (select auth.uid())));
CREATE POLICY rental_visit_participants ON public.rental_visits FOR SELECT TO authenticated
  USING (renter_id = (select auth.uid()) OR EXISTS (
    SELECT 1 FROM public.rental_listings l WHERE l.id = listing_id AND l.host_id = (select auth.uid())
  ));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rental-photos', 'rental-photos', false, 3500000, ARRAY['image/webp']);

CREATE POLICY rental_photo_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rental-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
CREATE POLICY rental_photo_read ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'rental-photos' AND (
    (storage.foldername(name))[1] = (select auth.uid())::text
    OR EXISTS (SELECT 1 FROM public.rental_listings l
      WHERE l.status = 'published' AND ('/api/rentals/photos/' || name) = ANY (l.photos))
  ));

CREATE FUNCTION public.rental_open_times(listing uuid)
RETURNS TABLE (id uuid, starts_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id, s.starts_at FROM public.rental_slots s
  JOIN public.rental_listings l ON l.host_id = s.host_id
  WHERE l.id = listing AND l.status = 'published' AND s.starts_at > now()
    AND NOT EXISTS (SELECT 1 FROM public.rental_visits v WHERE v.slot_id = s.id
      AND v.status IN ('pending','proposed','confirmed'))
  ORDER BY s.starts_at LIMIT 64;
$$;
REVOKE ALL ON FUNCTION public.rental_open_times(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_open_times(uuid) TO anon, authenticated;

CREATE FUNCTION public.rental_request_viewing(listing uuid, chosen_slot uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  owner uuid;
  start_time timestamptz;
  visit uuid;
BEGIN
  IF actor IS NULL THEN RETURN NULL; END IF;
  SELECT l.host_id INTO owner FROM public.rental_listings l
    WHERE l.id = listing AND l.status = 'published' FOR SHARE;
  IF owner IS NULL OR owner = actor THEN RETURN NULL; END IF;
  UPDATE public.rental_visits SET status='cancelled'
    WHERE listing_id=listing AND renter_id=actor AND starts_at < now()
      AND status IN ('pending','proposed','confirmed');
  SELECT v.id INTO visit FROM public.rental_visits v
    WHERE v.listing_id=listing AND v.renter_id=actor AND v.status IN ('pending','proposed','confirmed');
  IF visit IS NOT NULL THEN RETURN visit; END IF;
  IF chosen_slot IS NOT NULL THEN
    SELECT s.starts_at INTO start_time FROM public.rental_slots s
      WHERE s.id=chosen_slot AND s.host_id=owner AND s.starts_at > now() FOR UPDATE;
    IF start_time IS NULL THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO public.rental_visits(listing_id,slot_id,renter_id,starts_at)
  VALUES (listing,chosen_slot,actor,start_time) ON CONFLICT DO NOTHING RETURNING id INTO visit;
  IF visit IS NULL THEN
    SELECT v.id INTO visit FROM public.rental_visits v
      WHERE v.listing_id=listing AND v.renter_id=actor AND v.status IN ('pending','proposed','confirmed');
  END IF;
  RETURN visit;
END;
$$;
REVOKE ALL ON FUNCTION public.rental_request_viewing(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_request_viewing(uuid,uuid) TO authenticated;

CREATE FUNCTION public.rental_update_viewing(visit uuid, next_status text, proposed_time timestamptz DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RETURN false; END IF;
  UPDATE public.rental_visits v
    SET status = next_status,
        starts_at = CASE WHEN next_status = 'proposed' THEN proposed_time ELSE v.starts_at END,
        slot_id = CASE WHEN next_status = 'proposed' THEN NULL ELSE v.slot_id END
  FROM public.rental_listings l WHERE v.id = visit AND l.id = v.listing_id
    AND (
      (v.renter_id = actor AND (
        (next_status = 'cancelled' AND v.status IN ('pending','proposed','confirmed'))
        OR (next_status = 'confirmed' AND v.status = 'proposed' AND v.starts_at > now())
      ))
      OR (l.host_id = actor AND (
        (next_status = 'declined' AND v.status IN ('pending','proposed'))
        OR (next_status = 'confirmed' AND v.status = 'pending' AND v.starts_at > now())
        OR (next_status = 'cancelled' AND v.status IN ('pending','proposed','confirmed'))
        OR (next_status = 'proposed' AND v.status IN ('pending','proposed') AND proposed_time > now())
      ))
    );
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.rental_update_viewing(uuid,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_update_viewing(uuid,text,timestamptz) TO authenticated;

ALTER TABLE public.content_translations DROP CONSTRAINT content_translations_content_type_check;
ALTER TABLE public.content_translations ADD CONSTRAINT content_translations_content_type_check
  CHECK (content_type IN ('event','moment','profile','blog','venue','comment','organizer','track','people','experience','tribe','festival','menu_item','menu_section','rental'));
CREATE POLICY rental_translation_private_guard ON public.content_translations AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (content_type <> 'rental' OR EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id=content_id AND l.status='published'));
CREATE POLICY rental_translation_read ON public.content_translations FOR SELECT TO anon, authenticated
  USING (content_type='rental' AND NOT is_stale AND field_name IN ('title','description')
    AND EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id=content_id AND l.status='published'));
CREATE TRIGGER invalidate_rental_translation AFTER UPDATE OR DELETE ON public.rental_listings
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_content_translations('rental','id','title,description,source_locale,status');

INSERT INTO public.rental_listings(id,host_id,title,description,source_locale,monthly_rent,six_month_rent,yearly_rent,photos,status)
SELECT 'c7725f24-49f5-469f-b95f-417b7e5ec3d3', p.id, 'King’s Paradise', 'Best place on earth', 'en',
       40000000, 35000000, 30000000,
       ARRAY(SELECT '/rentals/king-paradise/photo-' || n || '.webp' FROM unnest(ARRAY[5,1,2,3,4,6]) n),
       'published'
FROM public.profiles p WHERE p.username='yan' AND p.role='superadmin';

COMMIT;
