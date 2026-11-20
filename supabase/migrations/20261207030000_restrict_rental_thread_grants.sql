BEGIN;

REVOKE ALL ON TABLE public.rental_directions, public.rental_visit_events, public.rental_reschedules FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.rental_directions TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.rental_directions TO authenticated;
GRANT SELECT ON TABLE public.rental_visit_events, public.rental_reschedules TO authenticated;
GRANT INSERT (visit_id, body) ON TABLE public.rental_visit_events TO authenticated;

COMMIT;
