-- Add image metadata columns to venues and organizers for SEO
-- Also update translation CHECK constraints to support image_alt and image_description

-- Venues: add cover image metadata columns
ALTER TABLE venues
ADD COLUMN IF NOT EXISTS cover_image_alt text,
ADD COLUMN IF NOT EXISTS cover_image_description text,
ADD COLUMN IF NOT EXISTS cover_image_keywords text[],
ADD COLUMN IF NOT EXISTS cover_image_colors text[],
ADD COLUMN IF NOT EXISTS logo_alt text,
ADD COLUMN IF NOT EXISTS logo_description text;

-- Organizers: add logo metadata columns
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS logo_alt text,
ADD COLUMN IF NOT EXISTS logo_description text;

-- Update content_translations field_name CHECK constraint to include image fields
-- First drop existing constraint, then add new one
ALTER TABLE content_translations
DROP CONSTRAINT IF EXISTS content_translations_field_name_check;

ALTER TABLE content_translations
ADD CONSTRAINT content_translations_field_name_check
CHECK (field_name IN (
  'title',
  'description',
  'text_content',
  'bio',
  'story_content',
  'technical_content',
  'meta_description',
  'image_alt',
  'image_description'
));

-- Update content_type CHECK to include organizer
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

-- Add comments for documentation
COMMENT ON COLUMN venues.cover_image_alt IS 'SEO alt text for cover image (translatable)';
COMMENT ON COLUMN venues.cover_image_description IS 'Rich description for AI search engines (translatable)';
COMMENT ON COLUMN organizers.logo_alt IS 'SEO alt text for logo (translatable)';
COMMENT ON COLUMN organizers.logo_description IS 'Rich description for AI search engines (translatable)';
