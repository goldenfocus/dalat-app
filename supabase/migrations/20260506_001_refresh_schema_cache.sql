-- Clean up any leftover function overloads and refresh schema cache

-- Drop any old function signatures that might conflict
DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text);
DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text, uuid, text);

-- Force PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';
