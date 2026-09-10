-- Reserve the new static route using the existing unified-slug mechanism.
-- No tables, policies, or profile records change. Fail rather than shadow an entity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM unified_slugs WHERE slug = 'thu')
     OR EXISTS (SELECT 1 FROM profiles WHERE username = 'thu')
     OR EXISTS (SELECT 1 FROM organizers WHERE slug = 'thu')
     OR EXISTS (SELECT 1 FROM venues WHERE slug = 'thu') THEN
    RAISE EXCEPTION 'The /thu route belongs to an existing entity; do not deploy the workshop';
  END IF;
  INSERT INTO reserved_slugs (slug, reason)
  VALUES ('thu', 'Unlisted collaboration workshop route')
  ON CONFLICT (slug) DO NOTHING;
END $$;
