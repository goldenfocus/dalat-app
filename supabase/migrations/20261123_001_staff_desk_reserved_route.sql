-- The private staff desk owns /staff in the shared root URL namespace.
-- Abort rather than shadow an existing profile, venue, or organizer handle.
BEGIN;
LOCK TABLE public.unified_slugs, public.reserved_slugs IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.unified_slugs WHERE slug = 'staff')
    OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = 'staff')
    OR EXISTS (SELECT 1 FROM public.venues WHERE lower(slug) = 'staff')
    OR EXISTS (SELECT 1 FROM public.organizers WHERE lower(slug) = 'staff') THEN
    RAISE EXCEPTION 'Cannot reserve /staff: an existing handle owns this route';
  END IF;
END $$;
INSERT INTO public.reserved_slugs (slug, reason)
VALUES ('staff', 'Private event staff desk')
ON CONFLICT (slug) DO NOTHING;
COMMIT;
