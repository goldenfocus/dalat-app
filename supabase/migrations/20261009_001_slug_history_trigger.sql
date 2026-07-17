-- Slug history trigger: make previous_slugs impossible to bypass.
--
-- Context: old-slug redirects rely on events.previous_slugs, but the append
-- was only done client-side in the event edit form. Any other rename path
-- (admin SQL, API routes, delete+recreate flows editing the row) silently
-- lost the old slug, leaving indexed URLs to 404 (Jul 14 poker incident).
--
-- This trigger records the old slug at the database layer on every rename.

CREATE OR REPLACE FUNCTION public.events_append_previous_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug AND OLD.slug IS NOT NULL THEN
    IF NOT (OLD.slug = ANY(COALESCE(NEW.previous_slugs, '{}'))) THEN
      NEW.previous_slugs := array_append(COALESCE(NEW.previous_slugs, '{}'), OLD.slug);
    END IF;
    -- If the event is renamed back to a slug it previously held, drop that
    -- slug from history so the row never lists its own current slug.
    NEW.previous_slugs := array_remove(NEW.previous_slugs, NEW.slug);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_append_previous_slug ON public.events;

CREATE TRIGGER trg_events_append_previous_slug
  BEFORE UPDATE OF slug ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.events_append_previous_slug();
