-- =============================================================================
-- Unified Slugs System
-- =============================================================================
-- Creates a shared namespace for venues, organizers, and profiles so everyone
-- gets a cool dalat.app/name URL instead of dalat.app/venues/name.
--
-- Key components:
-- 1. unified_slugs - Central registry mapping slugs to entities
-- 2. reserved_slugs - Blocked slugs (routes, locales, system words)
-- 3. RPC functions for slug resolution and availability checking
-- 4. Sync triggers to keep unified_slugs in sync with source tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. UNIFIED SLUGS TABLE
-- -----------------------------------------------------------------------------
-- Central registry for all slugs in the unified namespace.
-- Each slug can only belong to one entity (venue, organizer, or profile).
-- is_primary=false slugs are for redirects (old slugs that should redirect).

CREATE TABLE IF NOT EXISTS unified_slugs (
  slug text PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('venue', 'organizer', 'profile')),
  entity_id uuid NOT NULL,
  is_primary boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_unified_slugs_entity
  ON unified_slugs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_unified_slugs_primary
  ON unified_slugs(slug) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_unified_slugs_redirects
  ON unified_slugs(entity_type, entity_id) WHERE is_primary = false;

-- Ensure each entity has at most one primary slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_slugs_one_primary
  ON unified_slugs(entity_type, entity_id) WHERE is_primary = true;

COMMENT ON TABLE unified_slugs IS 'Central registry for unified URL namespace. Maps slugs to venues, organizers, or profiles.';
COMMENT ON COLUMN unified_slugs.slug IS 'The URL slug (lowercase, alphanumeric with hyphens)';
COMMENT ON COLUMN unified_slugs.entity_type IS 'Type of entity: venue, organizer, or profile';
COMMENT ON COLUMN unified_slugs.entity_id IS 'UUID of the entity in its respective table';
COMMENT ON COLUMN unified_slugs.is_primary IS 'True for current slug, false for old slugs that redirect';

-- -----------------------------------------------------------------------------
-- 2. RESERVED SLUGS TABLE
-- -----------------------------------------------------------------------------
-- Slugs that cannot be used by any entity (routes, locales, system words).

CREATE TABLE IF NOT EXISTS reserved_slugs (
  slug text PRIMARY KEY,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE reserved_slugs IS 'Slugs blocked from use (routes, locales, system words)';

-- Insert reserved slugs
INSERT INTO reserved_slugs (slug, reason) VALUES
  -- Existing routes (from app/[locale]/ directory)
  ('events', 'Route: /events'),
  ('venues', 'Route: /venues'),
  ('organizers', 'Route: /organizers'),
  ('map', 'Route: /map'),
  ('feed', 'Route: /feed'),
  ('calendar', 'Route: /calendar'),
  ('search', 'Route: /search'),
  ('moments', 'Route: /moments'),
  ('blog', 'Route: /blog'),
  ('festivals', 'Route: /festivals'),
  ('tribes', 'Route: /tribes'),
  ('series', 'Route: /series'),
  ('invite', 'Route: /invite'),
  ('about', 'Route: /about'),
  ('admin', 'Route: /admin'),
  ('organizer', 'Route: /organizer'),
  ('settings', 'Route: /settings'),
  ('auth', 'Route: /auth'),
  ('protected', 'Route: /protected'),
  ('onboarding', 'Route: /onboarding'),
  ('api', 'Route: /api'),
  -- Locales (the global twelve)
  ('en', 'Locale'),
  ('vi', 'Locale'),
  ('ko', 'Locale'),
  ('zh', 'Locale'),
  ('ru', 'Locale'),
  ('fr', 'Locale'),
  ('ja', 'Locale'),
  ('ms', 'Locale'),
  ('th', 'Locale'),
  ('de', 'Locale'),
  ('es', 'Locale'),
  ('id', 'Locale'),
  -- Auth-related
  ('login', 'Auth'),
  ('logout', 'Auth'),
  ('signup', 'Auth'),
  ('register', 'Auth'),
  ('signin', 'Auth'),
  ('signout', 'Auth'),
  ('callback', 'Auth'),
  ('verify', 'Auth'),
  ('reset', 'Auth'),
  ('password', 'Auth'),
  -- System words
  ('profile', 'System'),
  ('user', 'System'),
  ('users', 'System'),
  ('help', 'System'),
  ('support', 'System'),
  ('contact', 'System'),
  ('privacy', 'System'),
  ('terms', 'System'),
  ('tos', 'System'),
  ('null', 'System'),
  ('undefined', 'System'),
  ('root', 'System'),
  ('system', 'System'),
  ('www', 'System'),
  ('mail', 'System'),
  ('email', 'System'),
  ('ftp', 'System'),
  ('static', 'System'),
  ('assets', 'System'),
  ('cdn', 'System'),
  ('img', 'System'),
  ('images', 'System'),
  ('js', 'System'),
  ('css', 'System'),
  ('fonts', 'System'),
  ('favicon', 'System'),
  ('robots', 'System'),
  ('sitemap', 'System'),
  ('manifest', 'System'),
  ('sw', 'System'),
  ('service-worker', 'System'),
  -- Social
  ('facebook', 'Reserved'),
  ('twitter', 'Reserved'),
  ('instagram', 'Reserved'),
  ('tiktok', 'Reserved'),
  ('youtube', 'Reserved'),
  ('linkedin', 'Reserved'),
  ('zalo', 'Reserved')
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. RPC FUNCTIONS
-- -----------------------------------------------------------------------------

-- Resolve a slug to its entity type and ID
CREATE OR REPLACE FUNCTION resolve_unified_slug(p_slug text)
RETURNS json
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug_record unified_slugs;
  v_canonical_slug text;
BEGIN
  -- Look up the slug (case-insensitive)
  SELECT * INTO v_slug_record
  FROM unified_slugs
  WHERE slug = lower(trim(p_slug));

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  -- If this is a redirect slug (not primary), find the primary slug
  IF NOT v_slug_record.is_primary THEN
    SELECT us.slug INTO v_canonical_slug
    FROM unified_slugs us
    WHERE us.entity_type = v_slug_record.entity_type
      AND us.entity_id = v_slug_record.entity_id
      AND us.is_primary = true;
  ELSE
    v_canonical_slug := v_slug_record.slug;
  END IF;

  RETURN json_build_object(
    'found', true,
    'entity_type', v_slug_record.entity_type,
    'entity_id', v_slug_record.entity_id,
    'is_redirect', NOT v_slug_record.is_primary,
    'canonical_slug', v_canonical_slug
  );
END;
$$;

COMMENT ON FUNCTION resolve_unified_slug IS 'Resolves a slug to its entity type and ID. Returns redirect info if slug is not primary.';

-- Check if a slug is available
CREATE OR REPLACE FUNCTION check_unified_slug_available(
  p_slug text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(trim(p_slug));
BEGIN
  -- Validate slug format
  IF v_slug IS NULL OR length(v_slug) < 2 THEN
    RETURN json_build_object(
      'available', false,
      'reason', 'too_short'
    );
  END IF;

  IF NOT (v_slug ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$') THEN
    RETURN json_build_object(
      'available', false,
      'reason', 'invalid_format'
    );
  END IF;

  -- Check reserved slugs
  IF EXISTS (SELECT 1 FROM reserved_slugs WHERE slug = v_slug) THEN
    RETURN json_build_object(
      'available', false,
      'reason', 'reserved'
    );
  END IF;

  -- Check existing unified slugs (excluding current entity if editing)
  IF EXISTS (
    SELECT 1 FROM unified_slugs
    WHERE slug = v_slug
      AND NOT (
        p_entity_type IS NOT NULL
        AND p_entity_id IS NOT NULL
        AND entity_type = p_entity_type
        AND entity_id = p_entity_id
      )
  ) THEN
    RETURN json_build_object(
      'available', false,
      'reason', 'taken'
    );
  END IF;

  RETURN json_build_object('available', true);
END;
$$;

COMMENT ON FUNCTION check_unified_slug_available IS 'Checks if a slug is available for use. Returns reason if not available.';

-- Grant execute to all users (these are read-only functions)
GRANT EXECUTE ON FUNCTION resolve_unified_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_unified_slug_available(text, text, uuid) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. SYNC TRIGGERS
-- -----------------------------------------------------------------------------
-- These triggers keep unified_slugs in sync when venues/organizers/profiles change.

-- Venue sync trigger
CREATE OR REPLACE FUNCTION sync_venue_to_unified_slugs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Add new slug
    INSERT INTO unified_slugs (slug, entity_type, entity_id, is_primary)
    VALUES (lower(NEW.slug), 'venue', NEW.id, true)
    ON CONFLICT (slug) DO NOTHING;

  ELSIF TG_OP = 'UPDATE' AND lower(NEW.slug) != lower(OLD.slug) THEN
    -- Mark old slug as redirect (not primary)
    UPDATE unified_slugs
    SET is_primary = false
    WHERE entity_type = 'venue'
      AND entity_id = NEW.id
      AND slug = lower(OLD.slug);

    -- Add new primary slug
    INSERT INTO unified_slugs (slug, entity_type, entity_id, is_primary)
    VALUES (lower(NEW.slug), 'venue', NEW.id, true)
    ON CONFLICT (slug) DO UPDATE SET is_primary = true;

  ELSIF TG_OP = 'DELETE' THEN
    -- Remove all slugs for this venue
    DELETE FROM unified_slugs
    WHERE entity_type = 'venue' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venue_unified_slug_sync ON venues;
CREATE TRIGGER trg_venue_unified_slug_sync
  AFTER INSERT OR UPDATE OF slug OR DELETE ON venues
  FOR EACH ROW EXECUTE FUNCTION sync_venue_to_unified_slugs();

-- Organizer sync trigger
CREATE OR REPLACE FUNCTION sync_organizer_to_unified_slugs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO unified_slugs (slug, entity_type, entity_id, is_primary)
    VALUES (lower(NEW.slug), 'organizer', NEW.id, true)
    ON CONFLICT (slug) DO NOTHING;

  ELSIF TG_OP = 'UPDATE' AND lower(NEW.slug) != lower(OLD.slug) THEN
    UPDATE unified_slugs
    SET is_primary = false
    WHERE entity_type = 'organizer'
      AND entity_id = NEW.id
      AND slug = lower(OLD.slug);

    INSERT INTO unified_slugs (slug, entity_type, entity_id, is_primary)
    VALUES (lower(NEW.slug), 'organizer', NEW.id, true)
    ON CONFLICT (slug) DO UPDATE SET is_primary = true;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM unified_slugs
    WHERE entity_type = 'organizer' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizer_unified_slug_sync ON organizers;
CREATE TRIGGER trg_organizer_unified_slug_sync
  AFTER INSERT OR UPDATE OF slug OR DELETE ON organizers
  FOR EACH ROW EXECUTE FUNCTION sync_organizer_to_unified_slugs();

-- Profile sync trigger (syncs username)
CREATE OR REPLACE FUNCTION sync_profile_to_unified_slugs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.username IS NOT NULL AND NEW.username != '' THEN
      INSERT INTO unified_slugs (slug, entity_type, entity_id, is_primary)
      VALUES (lower(NEW.username), 'profile', NEW.id, true)
      ON CONFLICT (slug) DO NOTHING;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle username changes
    IF OLD.username IS DISTINCT FROM NEW.username THEN
      -- Remove old username if it existed
      IF OLD.username IS NOT NULL AND OLD.username != '' THEN
        UPDATE unified_slugs
        SET is_primary = false
        WHERE entity_type = 'profile'
          AND entity_id = NEW.id
          AND slug = lower(OLD.username);
      END IF;

      -- Add new username if set
      IF NEW.username IS NOT NULL AND NEW.username != '' THEN
        INSERT INTO unified_slugs (slug, entity_type, entity_id, is_primary)
        VALUES (lower(NEW.username), 'profile', NEW.id, true)
        ON CONFLICT (slug) DO UPDATE SET is_primary = true;
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM unified_slugs
    WHERE entity_type = 'profile' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_unified_slug_sync ON profiles;
CREATE TRIGGER trg_profile_unified_slug_sync
  AFTER INSERT OR UPDATE OF username OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_profile_to_unified_slugs();

-- -----------------------------------------------------------------------------
-- 5. RLS POLICIES
-- -----------------------------------------------------------------------------

ALTER TABLE unified_slugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserved_slugs ENABLE ROW LEVEL SECURITY;

-- unified_slugs: public read, admin write
CREATE POLICY "unified_slugs_select_public"
  ON unified_slugs FOR SELECT USING (true);

CREATE POLICY "unified_slugs_insert_admin"
  ON unified_slugs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

CREATE POLICY "unified_slugs_update_admin"
  ON unified_slugs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

CREATE POLICY "unified_slugs_delete_admin"
  ON unified_slugs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- reserved_slugs: public read, admin write
CREATE POLICY "reserved_slugs_select_public"
  ON reserved_slugs FOR SELECT USING (true);

CREATE POLICY "reserved_slugs_insert_admin"
  ON reserved_slugs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- -----------------------------------------------------------------------------
-- 6. UPDATED_AT TRIGGER
-- -----------------------------------------------------------------------------

-- Note: unified_slugs doesn't have updated_at since slugs don't really "update"
-- They either exist or get replaced with is_primary=false
