BEGIN;

CREATE TABLE public.rental_directions (
  listing_id uuid PRIMARY KEY REFERENCES public.rental_listings(id) ON DELETE CASCADE,
  address text NOT NULL DEFAULT '' CHECK (length(address) <= 250),
  maps_url text NOT NULL DEFAULT '' CHECK (length(maps_url) <= 2048),
  grab_url text NOT NULL DEFAULT '' CHECK (length(grab_url) <= 2048),
  is_public boolean NOT NULL DEFAULT false
);

ALTER TABLE public.rental_directions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.rental_directions TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.rental_directions TO authenticated;

CREATE POLICY rental_directions_public ON public.rental_directions FOR SELECT TO anon, authenticated
  USING (is_public AND EXISTS (
    SELECT 1 FROM public.rental_listings l WHERE l.id = listing_id AND l.status = 'published'
  ));

CREATE POLICY rental_directions_confirmed ON public.rental_directions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rental_visits v WHERE v.listing_id = rental_directions.listing_id
      AND v.renter_id = (SELECT auth.uid()) AND v.status = 'confirmed'
  ));

CREATE POLICY rental_directions_owner ON public.rental_directions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id = listing_id AND l.host_id = (SELECT auth.uid())));
CREATE POLICY rental_directions_insert ON public.rental_directions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id = listing_id AND l.host_id = (SELECT auth.uid())));
CREATE POLICY rental_directions_update ON public.rental_directions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id = listing_id AND l.host_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id = listing_id AND l.host_id = (SELECT auth.uid())));

COMMIT;
