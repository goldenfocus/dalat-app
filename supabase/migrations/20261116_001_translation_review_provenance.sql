BEGIN;
ALTER TABLE public.content_translations
 ADD COLUMN ai_reviewed_at timestamptz,
 ADD COLUMN translator_model text,
 ADD COLUMN reviewer_model text;
COMMENT ON COLUMN public.content_translations.ai_reviewed_at IS 'Independent model review time. Does not imply human review; translation_status remains auto.';
COMMIT;
