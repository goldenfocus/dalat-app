ALTER TABLE public.rental_slots ADD COLUMN is_open boolean NOT NULL DEFAULT true;

-- An alternate time holds the same host slot as a regular request. An alternate
-- outside published hours stays private even after the request is cancelled.
CREATE OR REPLACE FUNCTION public.rental_open_times(listing uuid)
RETURNS TABLE (id uuid, starts_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id, s.starts_at FROM public.rental_slots s
  JOIN public.rental_listings l ON l.host_id = s.host_id
  WHERE l.id = listing AND l.status = 'published' AND s.starts_at > now() AND s.is_open
    AND NOT EXISTS (
      SELECT 1 FROM public.rental_visits v
      JOIN public.rental_listings booking ON booking.id = v.listing_id
      WHERE booking.host_id = s.host_id AND v.starts_at = s.starts_at
        AND v.status IN ('pending','proposed','confirmed')
    )
  ORDER BY s.starts_at LIMIT 64;
$$;

CREATE OR REPLACE FUNCTION public.rental_request_viewing(listing uuid, chosen_slot uuid DEFAULT NULL)
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
      WHERE s.id=chosen_slot AND s.host_id=owner AND s.starts_at > now() AND s.is_open FOR UPDATE;
    IF start_time IS NULL OR EXISTS (
      SELECT 1 FROM public.rental_visits v
      JOIN public.rental_listings booking ON booking.id = v.listing_id
      WHERE booking.host_id = owner AND v.starts_at = start_time
        AND v.status IN ('pending','proposed','confirmed')
    ) THEN RETURN NULL; END IF;
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

CREATE OR REPLACE FUNCTION public.rental_update_viewing(visit uuid, next_status text, proposed_time timestamptz DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  proposed_slot uuid;
BEGIN
  IF actor IS NULL THEN RETURN false; END IF;
  IF next_status = 'proposed' THEN
    IF proposed_time IS NULL OR proposed_time <= now() THEN RETURN false; END IF;
    PERFORM 1
      FROM public.rental_visits v JOIN public.rental_listings l ON l.id = v.listing_id
      WHERE v.id = visit AND l.host_id = actor AND v.status IN ('pending','proposed')
      FOR UPDATE OF v;
    IF NOT FOUND THEN RETURN false; END IF;
    INSERT INTO public.rental_slots(host_id, starts_at, is_open)
      VALUES (actor, proposed_time, false)
      ON CONFLICT (host_id, starts_at) DO NOTHING;
    SELECT s.id INTO proposed_slot FROM public.rental_slots s
      WHERE s.host_id = actor AND s.starts_at = proposed_time FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM public.rental_visits v
      JOIN public.rental_listings booking ON booking.id = v.listing_id
      WHERE booking.host_id = actor AND v.starts_at = proposed_time AND v.id <> visit
        AND v.status IN ('pending','proposed','confirmed')
    ) THEN RETURN false; END IF;
  END IF;
  UPDATE public.rental_visits v
    SET status = next_status,
        starts_at = CASE WHEN next_status = 'proposed' THEN proposed_time ELSE v.starts_at END,
        slot_id = CASE WHEN next_status = 'proposed' THEN proposed_slot ELSE v.slot_id END
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


CREATE FUNCTION public.rental_publish_slots(times timestamptz[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  host uuid := auth.uid();
BEGIN
  IF host IS NULL OR coalesce(cardinality(times), 0) NOT BETWEEN 1 AND 961
    OR EXISTS (SELECT 1 FROM unnest(times) AS item(at) WHERE at IS NULL OR at <= now())
    OR NOT EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.host_id = host)
  THEN RETURN false; END IF;
  INSERT INTO public.rental_slots (host_id, starts_at, is_open)
    SELECT DISTINCT host, at, true FROM unnest(times) AS item(at)
    ORDER BY at
    ON CONFLICT (host_id, starts_at) DO UPDATE SET is_open = true;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rental_publish_slots(timestamptz[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_publish_slots(timestamptz[]) TO authenticated;
