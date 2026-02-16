-- Fix PGRST203: Drop the old create_moment_draft overload (7 params)
-- that conflicts with the new 8-param version (with p_cf_video_uid).
-- CREATE OR REPLACE with different param lists creates an overload, not a replacement.
DROP FUNCTION IF EXISTS create_moment_draft(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, FLOAT);
