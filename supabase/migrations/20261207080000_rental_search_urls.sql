BEGIN;

ALTER TABLE public.rental_listings
  ADD COLUMN slug text UNIQUE CHECK (char_length(slug) BETWEEN 1 AND 110),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE FUNCTION rental_private.assign_listing_search_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  stem text;
  candidate text;
  suffix integer := 1;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.slug := OLD.slug;
  ELSE
    NEW.slug := NULL;
  END IF;
  NEW.updated_at := now();
  IF NEW.status <> 'published' OR NEW.slug IS NOT NULL THEN RETURN NEW; END IF;

  stem := lower(translate(normalize(NEW.title, NFD), 'Đđ', 'dd'));
  stem := regexp_replace(stem, U&'[\0300-\036f]', '', 'g');
  stem := regexp_replace(stem, '[^[:alnum:]]+', '-', 'g');
  stem := trim(BOTH '-' FROM left(regexp_replace(stem, '(^|-)(da-lat|dalat)(?=-|$)', '', 'g'), 88));
  stem := coalesce(nullif(stem, ''), 'rental') || '-da-lat';

  -- A base always ends in Da Lat. Numeric collision suffixes therefore cannot
  -- shadow a different property's base, and same-base assignments serialize.
  PERFORM pg_advisory_xact_lock(hashtextextended('rental-slug:' || stem, 0));
  candidate := stem;
  WHILE EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.slug = candidate) LOOP
    suffix := suffix + 1;
    candidate := stem || '-' || suffix::text;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION rental_private.assign_listing_search_fields() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rental_assign_search_fields BEFORE INSERT OR UPDATE ON public.rental_listings
  FOR EACH ROW EXECUTE FUNCTION rental_private.assign_listing_search_fields();

DO $$
DECLARE listing uuid;
BEGIN
  FOR listing IN SELECT id FROM public.rental_listings WHERE status = 'published' ORDER BY created_at, id LOOP
    UPDATE public.rental_listings SET status = 'published' WHERE id = listing;
  END LOOP;
END;
$$;

ALTER TABLE public.rental_listings ADD CONSTRAINT rental_published_has_slug
  CHECK (status <> 'published' OR slug IS NOT NULL);

COMMIT;
