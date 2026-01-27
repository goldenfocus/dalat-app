-- Fix: Add superadmin to role level hierarchy
-- The superadmin role was not recognized by get_role_level(), causing
-- permission checks to fail for superadmin users (returned 0 instead of highest level)

-- Update get_role_level to include superadmin with highest priority (110)
CREATE OR REPLACE FUNCTION get_role_level(p_role text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_role
    WHEN 'superadmin' THEN 110
    WHEN 'admin' THEN 100
    WHEN 'moderator' THEN 80
    WHEN 'organizer_verified' THEN 60
    WHEN 'organizer_pending' THEN 50
    WHEN 'contributor' THEN 40
    WHEN 'user' THEN 10
    ELSE 0
  END;
$$;
