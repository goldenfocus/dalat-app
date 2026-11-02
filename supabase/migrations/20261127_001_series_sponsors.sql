-- Visual sponsors belong to the recurring series; individual event links remain
-- independent. The effective date avoids adding new sponsors to past editions.
BEGIN;

CREATE TABLE IF NOT EXISTS public.series_sponsors (
  series_id uuid NOT NULL REFERENCES public.event_series(id) ON DELETE CASCADE,
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  effective_from timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, sponsor_id)
);

ALTER TABLE public.series_sponsors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.series_sponsors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.series_sponsors TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.series_sponsors TO service_role;

DROP POLICY IF EXISTS series_sponsors_select ON public.series_sponsors;
CREATE POLICY series_sponsors_select ON public.series_sponsors
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.inherit_series_sponsors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.series_id IS NOT NULL THEN
    INSERT INTO public.event_sponsors (event_id, sponsor_id, sort_order)
    SELECT NEW.id, s.sponsor_id, s.sort_order
    FROM public.series_sponsors AS s
    JOIN public.event_series AS series ON series.id = s.series_id
    WHERE s.series_id = NEW.series_id
      AND series.created_by = NEW.created_by
      AND NEW.starts_at >= s.effective_from
    ON CONFLICT (event_id, sponsor_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.inherit_series_sponsors()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS inherit_series_sponsors ON public.events;
CREATE TRIGGER inherit_series_sponsors
  AFTER INSERT OR UPDATE OF series_id, starts_at ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.inherit_series_sponsors();

COMMIT;
