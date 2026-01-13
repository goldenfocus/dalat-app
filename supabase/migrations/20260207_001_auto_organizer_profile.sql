-- Auto-create Organizer Profile for Verified Organizers
-- When a user's role changes to 'organizer_verified', automatically create an organizer profile
-- This ensures organizers never see the "No organizer profile linked" warning

-- ============================================
-- STEP 1: Helper function to generate unique slug
-- ============================================

CREATE OR REPLACE FUNCTION generate_unique_organizer_slug(p_base_slug text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_slug text;
  v_counter int := 0;
BEGIN
  -- Clean the base slug (lowercase, alphanumeric and hyphens only)
  v_slug := lower(regexp_replace(p_base_slug, '[^a-zA-Z0-9-]', '-', 'g'));
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');  -- Remove consecutive hyphens
  v_slug := trim(both '-' from v_slug);  -- Remove leading/trailing hyphens

  -- If empty after cleaning, use 'organizer'
  IF v_slug = '' THEN
    v_slug := 'organizer';
  END IF;

  -- Check if slug exists, if so add incrementing suffix
  WHILE EXISTS (SELECT 1 FROM organizers WHERE slug = v_slug || CASE WHEN v_counter = 0 THEN '' ELSE '-' || v_counter::text END) LOOP
    v_counter := v_counter + 1;
  END LOOP;

  RETURN v_slug || CASE WHEN v_counter = 0 THEN '' ELSE '-' || v_counter::text END;
END;
$$;

-- ============================================
-- STEP 2: Trigger function to auto-create organizer
-- ============================================

CREATE OR REPLACE FUNCTION auto_create_organizer_for_verified_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_name text;
BEGIN
  -- Only proceed if role changed TO organizer_verified
  IF NEW.role = 'organizer_verified' AND (OLD.role IS NULL OR OLD.role <> 'organizer_verified') THEN
    -- Check if user already has an organizer profile
    IF NOT EXISTS (SELECT 1 FROM organizers WHERE owner_id = NEW.id) THEN
      -- Generate unique slug from username or display_name
      v_slug := generate_unique_organizer_slug(COALESCE(NEW.username, NEW.display_name, 'organizer'));

      -- Use display_name or username as organizer name
      v_name := COALESCE(NEW.display_name, NEW.username, 'New Organizer');

      -- Create the organizer profile
      INSERT INTO organizers (slug, name, owner_id, is_verified, organizer_type)
      VALUES (v_slug, v_name, NEW.id, true, 'venue');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================
-- STEP 3: Create the trigger
-- ============================================

-- Drop if exists (for idempotency)
DROP TRIGGER IF EXISTS trg_auto_create_organizer ON profiles;

-- Create trigger that fires after role update
CREATE TRIGGER trg_auto_create_organizer
  AFTER UPDATE OF role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_organizer_for_verified_user();

-- ============================================
-- STEP 4: Backfill existing organizer_verified users
-- ============================================

-- Create organizer profiles for any existing organizer_verified users who don't have one
DO $$
DECLARE
  r RECORD;
  v_slug text;
  v_name text;
BEGIN
  FOR r IN
    SELECT p.id, p.username, p.display_name
    FROM profiles p
    WHERE p.role = 'organizer_verified'
    AND NOT EXISTS (SELECT 1 FROM organizers o WHERE o.owner_id = p.id)
  LOOP
    -- Generate unique slug
    v_slug := generate_unique_organizer_slug(COALESCE(r.username, r.display_name, 'organizer'));
    v_name := COALESCE(r.display_name, r.username, 'New Organizer');

    INSERT INTO organizers (slug, name, owner_id, is_verified, organizer_type)
    VALUES (v_slug, v_name, r.id, true, 'venue');

    RAISE NOTICE 'Created organizer profile for user %: slug=%', r.id, v_slug;
  END LOOP;
END;
$$;

-- ============================================
-- STEP 5: Grant execute on helper function
-- ============================================

GRANT EXECUTE ON FUNCTION generate_unique_organizer_slug(text) TO authenticated;
