-- Delete useless same-language translations (where source_locale = target_locale)
-- These entries serve no purpose since we now return original content when viewing
-- in the source language, and they may contain incorrect data (e.g., English text
-- stored as a "French to French" translation).

DELETE FROM content_translations
WHERE source_locale = target_locale;

-- Log what was deleted (for audit purposes, visible in migration output)
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % same-language translation entries', deleted_count;
END $$;
