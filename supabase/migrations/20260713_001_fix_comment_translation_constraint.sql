-- Fix content_translations CHECK constraints to include 'comment' content type
-- and 'content' field name for comment translations

-- Fix content_type constraint
ALTER TABLE content_translations
DROP CONSTRAINT IF EXISTS content_translations_content_type_check;

ALTER TABLE content_translations
ADD CONSTRAINT content_translations_content_type_check
CHECK (content_type IN (
  'event',
  'moment',
  'profile',
  'blog',
  'venue',
  'comment',
  'organizer'
));

-- Fix field_name constraint to include 'content' for comments
ALTER TABLE content_translations
DROP CONSTRAINT IF EXISTS content_translations_field_name_check;

ALTER TABLE content_translations
ADD CONSTRAINT content_translations_field_name_check
CHECK (field_name IN (
  -- Existing fields
  'title', 'description', 'text_content', 'bio',
  'story_content', 'technical_content', 'meta_description',
  'image_alt', 'image_description',
  -- AI metadata fields
  'ai_description', 'scene_description', 'video_summary',
  'audio_summary', 'pdf_summary',
  -- Comment field
  'content'
));
