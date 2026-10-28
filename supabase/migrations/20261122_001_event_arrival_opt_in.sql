-- Language-exchange arrival is opt-in, never a generic concert/event flow.
BEGIN;
ALTER TABLE public.events ADD COLUMN arrival_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.event_series ADD COLUMN arrival_enabled boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.inherit_event_arrival_opt_in() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- INSERT only: an organizer may disable a particular occurrence afterward.
 IF NEW.series_id IS NOT NULL AND NOT NEW.arrival_enabled THEN
  NEW.arrival_enabled:=COALESCE((SELECT arrival_enabled FROM event_series WHERE id=NEW.series_id),false);
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.inherit_event_arrival_opt_in() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER inherit_event_arrival_opt_in BEFORE INSERT ON public.events
 FOR EACH ROW EXECUTE FUNCTION public.inherit_event_arrival_opt_in();

-- The launch partner's exact series only; no title/venue fuzzy matching.
UPDATE public.event_series SET arrival_enabled=true
 WHERE slug='language-exchange-social-house-z8oc';
UPDATE public.events e SET arrival_enabled=true
 FROM public.event_series s
 WHERE e.series_id=s.id AND s.slug='language-exchange-social-house-z8oc'
 AND COALESCE(e.ends_at,e.starts_at+interval '6 hours')>=now();
COMMIT;
