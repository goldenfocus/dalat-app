ALTER TABLE public.rental_listings DROP CONSTRAINT IF EXISTS rental_listings_photos_check;

-- Return the full calendar. The app fetches it in ordered pages.
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
  ORDER BY s.starts_at;
$$;
