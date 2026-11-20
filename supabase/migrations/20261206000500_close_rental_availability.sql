CREATE FUNCTION public.rental_host_slots()
RETURNS TABLE (id uuid, starts_at timestamptz, visit_status text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT s.id, s.starts_at, booking.status
  FROM public.rental_slots s
  LEFT JOIN LATERAL (
    SELECT v.status
    FROM public.rental_visits v
    JOIN public.rental_listings l ON l.id = v.listing_id
    WHERE l.host_id = s.host_id AND v.starts_at = s.starts_at
      AND v.status IN ('pending', 'proposed', 'confirmed')
    ORDER BY v.created_at DESC, v.id
    LIMIT 1
  ) booking ON true
  WHERE s.host_id = (SELECT auth.uid()) AND s.is_open AND s.starts_at > now()
  ORDER BY s.starts_at;
$$;

CREATE FUNCTION public.rental_close_slots(chosen_slot uuid DEFAULT NULL, chosen_day date DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  host uuid := auth.uid();
  day_start timestamptz := chosen_day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  day_end timestamptz := (chosen_day + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  slot_ids uuid[];
BEGIN
  IF host IS NULL OR (chosen_slot IS NULL) = (chosen_day IS NULL) THEN RETURN false; END IF;

  -- Lock in the same order as publishing, then check bookings in a new statement
  -- so requests and proposals committed while waiting for a slot lock are visible.
  slot_ids := ARRAY(
    SELECT s.id FROM public.rental_slots s
    WHERE s.host_id = host AND s.is_open AND s.starts_at > now()
      AND (s.id = chosen_slot OR (s.starts_at >= day_start AND s.starts_at < day_end))
    ORDER BY s.starts_at FOR UPDATE
  );
  UPDATE public.rental_slots s SET is_open = false
  WHERE s.id = ANY(slot_ids) AND NOT EXISTS (
    SELECT 1 FROM public.rental_visits v
    JOIN public.rental_listings l ON l.id = v.listing_id
    WHERE l.host_id = host AND v.starts_at = s.starts_at
      AND v.status IN ('pending', 'proposed', 'confirmed')
  );
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.rental_host_slots(), public.rental_close_slots(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_host_slots(), public.rental_close_slots(uuid,date) TO authenticated;
