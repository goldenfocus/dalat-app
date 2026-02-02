-- =============================================================================
-- Populate Unified Slugs from Existing Data
-- =============================================================================
-- Migrates existing slugs from venues, organizers, and profiles into the
-- unified_slugs table. Handles conflicts by logging them for manual resolution.
--
-- Priority order (first come, first served):
-- 1. Venues (physical locations, harder to rename)
-- 2. Organizers
-- 3. Profiles (usernames)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CONFLICT LOGGING TABLE
-- -----------------------------------------------------------------------------
-- Tracks any conflicts found during migration for manual resolution

CREATE TABLE IF NOT EXISTS unified_slug_migration_conflicts (
  id serial PRIMARY KEY,
  original_slug text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  conflicting_with_type text,
  conflicting_with_id uuid,
  suggested_new_slug text,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  notes text,
  logged_at timestamptz DEFAULT now()
);

COMMENT ON TABLE unified_slug_migration_conflicts IS 'Tracks slug conflicts found during migration to unified namespace';

-- -----------------------------------------------------------------------------
-- 2. MIGRATE VENUE SLUGS (Highest Priority)
-- -----------------------------------------------------------------------------
-- Venues get first priority since they're physical locations

INSERT INTO unified_slugs (slug, entity_type, entity_id, is_primary)
SELECT lower(slug), 'venue', id, true
FROM venues
WHERE slug IS NOT NULL AND slug != ''
ON CONFLICT (slug) DO NOTHING;

-- Log any venues that failed to insert (shouldn't happen, but just in case)
INSERT INTO unified_slug_migration_conflicts
  (original_slug, entity_type, entity_id, notes)
SELECT v.slug, 'venue', v.id, 'Venue slug already exists in unified_slugs'
FROM venues v
WHERE v.slug IS NOT NULL
  AND v.slug != ''
  AND NOT EXISTS (
    SELECT 1 FROM unified_slugs us
    WHERE us.slug = lower(v.slug)
      AND us.entity_type = 'venue'
      AND us.entity_id = v.id
  );

-- -----------------------------------------------------------------------------
-- 3. MIGRATE ORGANIZER SLUGS (Second Priority)
-- -----------------------------------------------------------------------------

-- Insert organizer slugs, skipping conflicts
INSERT INTO unified_slugs (slug, entity_type, entity_id, is_primary)
SELECT lower(slug), 'organizer', id, true
FROM organizers
WHERE slug IS NOT NULL AND slug != ''
  AND lower(slug) NOT IN (SELECT slug FROM unified_slugs)
  AND lower(slug) NOT IN (SELECT slug FROM reserved_slugs)
ON CONFLICT (slug) DO NOTHING;

-- Log organizer conflicts with venues
INSERT INTO unified_slug_migration_conflicts
  (original_slug, entity_type, entity_id, conflicting_with_type, conflicting_with_id, suggested_new_slug)
SELECT
  o.slug,
  'organizer',
  o.id,
  us.entity_type,
  us.entity_id,
  o.slug || '-org'
FROM organizers o
JOIN unified_slugs us ON lower(o.slug) = us.slug
WHERE us.entity_type != 'organizer' OR us.entity_id != o.id;

-- Log organizer conflicts with reserved slugs
INSERT INTO unified_slug_migration_conflicts
  (original_slug, entity_type, entity_id, notes, suggested_new_slug)
SELECT
  o.slug,
  'organizer',
  o.id,
  'Conflicts with reserved slug: ' || rs.reason,
  o.slug || '-org'
FROM organizers o
JOIN reserved_slugs rs ON lower(o.slug) = rs.slug;

-- -----------------------------------------------------------------------------
-- 4. MIGRATE PROFILE USERNAMES (Third Priority)
-- -----------------------------------------------------------------------------

-- Insert profile usernames, skipping conflicts
INSERT INTO unified_slugs (slug, entity_type, entity_id, is_primary)
SELECT lower(username), 'profile', id, true
FROM profiles
WHERE username IS NOT NULL AND username != ''
  AND lower(username) NOT IN (SELECT slug FROM unified_slugs)
  AND lower(username) NOT IN (SELECT slug FROM reserved_slugs)
ON CONFLICT (slug) DO NOTHING;

-- Log profile conflicts with venues/organizers
INSERT INTO unified_slug_migration_conflicts
  (original_slug, entity_type, entity_id, conflicting_with_type, conflicting_with_id, notes)
SELECT
  p.username,
  'profile',
  p.id,
  us.entity_type,
  us.entity_id,
  'Username conflicts with existing ' || us.entity_type || '. User should change username.'
FROM profiles p
JOIN unified_slugs us ON lower(p.username) = us.slug
WHERE p.username IS NOT NULL
  AND p.username != ''
  AND (us.entity_type != 'profile' OR us.entity_id != p.id);

-- Log profile conflicts with reserved slugs
INSERT INTO unified_slug_migration_conflicts
  (original_slug, entity_type, entity_id, notes)
SELECT
  p.username,
  'profile',
  p.id,
  'Username conflicts with reserved slug: ' || rs.reason || '. User should change username.'
FROM profiles p
JOIN reserved_slugs rs ON lower(p.username) = rs.slug
WHERE p.username IS NOT NULL AND p.username != '';

-- -----------------------------------------------------------------------------
-- 5. SUMMARY VIEW
-- -----------------------------------------------------------------------------
-- Create a view to easily see migration status

CREATE OR REPLACE VIEW unified_slug_migration_summary AS
SELECT
  entity_type,
  COUNT(*) as migrated_count
FROM unified_slugs
GROUP BY entity_type
UNION ALL
SELECT
  'conflicts' as entity_type,
  COUNT(*) as count
FROM unified_slug_migration_conflicts
WHERE NOT resolved;

COMMENT ON VIEW unified_slug_migration_summary IS 'Summary of unified slug migration status';

-- Grant read access to view
GRANT SELECT ON unified_slug_migration_summary TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. ADMIN FUNCTION TO RESOLVE CONFLICTS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resolve_slug_conflict(
  p_conflict_id int,
  p_new_slug text,
  p_update_source boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict unified_slug_migration_conflicts;
  v_new_slug text := lower(trim(p_new_slug));
BEGIN
  -- Check caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can resolve slug conflicts';
  END IF;

  -- Get the conflict record
  SELECT * INTO v_conflict FROM unified_slug_migration_conflicts WHERE id = p_conflict_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conflict not found';
  END IF;

  IF v_conflict.resolved THEN
    RAISE EXCEPTION 'Conflict already resolved';
  END IF;

  -- Check new slug is available
  IF EXISTS (SELECT 1 FROM unified_slugs WHERE slug = v_new_slug) THEN
    RAISE EXCEPTION 'New slug % is already taken', v_new_slug;
  END IF;

  IF EXISTS (SELECT 1 FROM reserved_slugs WHERE slug = v_new_slug) THEN
    RAISE EXCEPTION 'New slug % is reserved', v_new_slug;
  END IF;

  -- Update the source table if requested
  IF p_update_source THEN
    CASE v_conflict.entity_type
      WHEN 'venue' THEN
        UPDATE venues SET slug = v_new_slug WHERE id = v_conflict.entity_id;
      WHEN 'organizer' THEN
        UPDATE organizers SET slug = v_new_slug WHERE id = v_conflict.entity_id;
      WHEN 'profile' THEN
        UPDATE profiles SET username = v_new_slug WHERE id = v_conflict.entity_id;
    END CASE;
  END IF;

  -- The trigger will handle adding to unified_slugs

  -- Mark conflict as resolved
  UPDATE unified_slug_migration_conflicts
  SET resolved = true, resolved_at = now(), notes = COALESCE(notes, '') || ' Resolved with slug: ' || v_new_slug
  WHERE id = p_conflict_id;

  RETURN json_build_object(
    'success', true,
    'new_slug', v_new_slug,
    'entity_type', v_conflict.entity_type,
    'entity_id', v_conflict.entity_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_slug_conflict(int, text, boolean) TO authenticated;
