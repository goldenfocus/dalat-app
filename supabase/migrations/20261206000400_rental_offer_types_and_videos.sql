CREATE TABLE public.rental_video_uploads (
  uid text PRIMARY KEY CHECK (uid ~ '^[a-f0-9]{32}$'),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.rental_video_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_video_uploads FROM anon, authenticated;
GRANT SELECT ON public.rental_video_uploads TO authenticated;
GRANT SELECT, INSERT ON public.rental_video_uploads TO service_role;
CREATE POLICY rental_video_owner_read ON public.rental_video_uploads FOR SELECT TO authenticated
  USING (host_id = (select auth.uid()));
CREATE INDEX rental_video_uploads_host ON public.rental_video_uploads (host_id);

ALTER TABLE public.rental_listings
  ADD COLUMN videos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN offer_type text NOT NULL DEFAULT 'rent' CHECK (offer_type IN ('rent','sale','both')),
  ADD COLUMN sale_price bigint CHECK (sale_price BETWEEN 1 AND 999999999999999),
  ALTER COLUMN monthly_rent DROP NOT NULL,
  ADD CONSTRAINT rental_listings_offer_prices CHECK (
    (offer_type = 'sale' AND monthly_rent IS NULL AND six_month_rent IS NULL AND yearly_rent IS NULL)
    OR (offer_type = 'rent' AND monthly_rent IS NOT NULL AND sale_price IS NULL)
    OR (offer_type = 'both' AND monthly_rent IS NOT NULL)
  );
GRANT INSERT (videos, offer_type, sale_price), UPDATE (videos, offer_type, sale_price)
  ON public.rental_listings TO authenticated;
CREATE INDEX rental_listings_videos ON public.rental_listings USING gin (videos);

CREATE FUNCTION public.rental_videos_owned(videos text[], owner uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM unnest(videos) AS video(uid)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.rental_video_uploads u WHERE u.uid = video.uid AND u.host_id = owner
    )
  );
$$;
REVOKE ALL ON FUNCTION public.rental_videos_owned(text[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_videos_owned(text[],uuid) TO authenticated;

ALTER POLICY rental_listing_insert ON public.rental_listings WITH CHECK (
  host_id = (select auth.uid())
  AND public.rental_photos_owned(photos,host_id,id)
  AND public.rental_videos_owned(videos,host_id)
);
ALTER POLICY rental_listing_update ON public.rental_listings WITH CHECK (
  host_id = (select auth.uid())
  AND public.rental_photos_owned(photos,host_id,id)
  AND public.rental_videos_owned(videos,host_id)
);
