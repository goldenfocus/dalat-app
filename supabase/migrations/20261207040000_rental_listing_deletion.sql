BEGIN;

ALTER TABLE public.rental_visits
  ALTER COLUMN listing_id DROP NOT NULL,
  ADD COLUMN archived_listing_id uuid,
  ADD COLUMN archived_host_id uuid,
  ADD CONSTRAINT rental_visit_listing_or_archive CHECK (
    (listing_id IS NOT NULL AND archived_listing_id IS NULL AND archived_host_id IS NULL)
    OR (listing_id IS NULL AND archived_listing_id IS NOT NULL AND archived_host_id IS NOT NULL)
  );

CREATE INDEX rental_visits_listing_history ON public.rental_visits(listing_id, renter_id)
  WHERE listing_id IS NOT NULL;
CREATE INDEX rental_visits_archived_history ON public.rental_visits(archived_listing_id, renter_id)
  WHERE archived_listing_id IS NOT NULL;
CREATE INDEX rental_visits_archived_host ON public.rental_visits(archived_host_id, created_at DESC)
  WHERE archived_host_id IS NOT NULL;

ALTER POLICY rental_visit_participants ON public.rental_visits
  USING (
    renter_id = (SELECT auth.uid()) OR archived_host_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id = listing_id AND l.host_id = (SELECT auth.uid()))
  );

CREATE FUNCTION rental_private.delete_listing(listing uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RETURN 'failed'; END IF;
  PERFORM 1 FROM public.rental_listings l
    WHERE l.id = listing AND l.host_id = actor AND l.status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'failed'; END IF;

  -- Serialize with viewing updates. A viewing action that already holds a row may also need the listing lock.
  PERFORM 1 FROM public.rental_visits v WHERE v.listing_id = listing FOR UPDATE NOWAIT;
  IF EXISTS (
    SELECT 1 FROM public.rental_visits v WHERE v.listing_id = listing
      AND v.status IN ('pending', 'proposed', 'confirmed') AND (v.starts_at IS NULL OR v.starts_at >= now())
  ) THEN RETURN 'active'; END IF;

  UPDATE public.rental_visits
    SET archived_listing_id = listing, archived_host_id = actor, listing_id = NULL
    WHERE listing_id = listing;
  DELETE FROM public.rental_listings WHERE id = listing;
  RETURN 'deleted';
END;
$$;

CREATE FUNCTION public.rental_delete_listing(listing uuid)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT rental_private.delete_listing(listing);
$$;

REVOKE ALL ON FUNCTION public.rental_delete_listing(uuid), rental_private.delete_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_delete_listing(uuid), rental_private.delete_listing(uuid) TO authenticated;

COMMIT;
