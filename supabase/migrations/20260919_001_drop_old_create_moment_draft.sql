-- Fix: PGRST203 "Could not choose the best candidate function" on create_moment_draft
--
-- Problem: Migration 20260815 created create_moment_draft with 8 params.
-- Migration 20260918 used CREATE OR REPLACE with 9 params (added p_file_hash).
-- PostgreSQL treats different param counts as OVERLOADED functions, not replacements.
-- PostgREST sees two functions and throws PGRST203 "ambiguous function call".
--
-- Fix: Drop the old 8-param version. The 9-param version stays.

DROP FUNCTION IF EXISTS create_moment_draft(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, FLOAT, TEXT);
