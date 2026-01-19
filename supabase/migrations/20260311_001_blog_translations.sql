-- Add blog translations support
-- Extends content_translations table to support blog posts

-- Drop and recreate the content_type check constraint to include 'blog'
ALTER TABLE content_translations DROP CONSTRAINT IF EXISTS content_translations_content_type_check;
ALTER TABLE content_translations ADD CONSTRAINT content_translations_content_type_check
  CHECK (content_type IN ('event', 'moment', 'profile', 'blog'));

-- Drop and recreate the field_name check constraint to include blog fields
ALTER TABLE content_translations DROP CONSTRAINT IF EXISTS content_translations_field_name_check;
ALTER TABLE content_translations ADD CONSTRAINT content_translations_field_name_check
  CHECK (field_name IN ('title', 'description', 'text_content', 'bio', 'story_content', 'technical_content', 'meta_description'));

-- Add source_locale column to blog_posts table for translation tracking
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS source_locale text DEFAULT 'en';

-- Update RLS policies to allow blog translation management
-- Blog posts are admin-only, so blog translations are covered by the admin check

DROP POLICY IF EXISTS "translations_insert_authenticated" ON content_translations;
CREATE POLICY "translations_insert_authenticated"
ON content_translations FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    -- Admin/moderator/superadmin check (covers blog translations)
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator', 'superadmin'))
    OR
    -- Event owner check
    (content_type = 'event' AND EXISTS (
      SELECT 1 FROM events WHERE id = content_id AND created_by = auth.uid()
    ))
    OR
    -- Profile owner check
    (content_type = 'profile' AND content_id = auth.uid())
    OR
    -- Moment owner check
    (content_type = 'moment' AND EXISTS (
      SELECT 1 FROM moments WHERE id = content_id AND user_id = auth.uid()
    ))
  )
);

DROP POLICY IF EXISTS "translations_update_authenticated" ON content_translations;
CREATE POLICY "translations_update_authenticated"
ON content_translations FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator', 'superadmin'))
    OR
    (content_type = 'event' AND EXISTS (
      SELECT 1 FROM events WHERE id = content_id AND created_by = auth.uid()
    ))
    OR
    (content_type = 'profile' AND content_id = auth.uid())
    OR
    (content_type = 'moment' AND EXISTS (
      SELECT 1 FROM moments WHERE id = content_id AND user_id = auth.uid()
    ))
  )
);

DROP POLICY IF EXISTS "translations_delete_authenticated" ON content_translations;
CREATE POLICY "translations_delete_authenticated"
ON content_translations FOR DELETE
USING (
  auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator', 'superadmin'))
    OR
    (content_type = 'event' AND EXISTS (
      SELECT 1 FROM events WHERE id = content_id AND created_by = auth.uid()
    ))
    OR
    (content_type = 'profile' AND content_id = auth.uid())
    OR
    (content_type = 'moment' AND EXISTS (
      SELECT 1 FROM moments WHERE id = content_id AND user_id = auth.uid()
    ))
  )
);

COMMENT ON TABLE content_translations IS 'Stores AI-generated translations for user content (events, moments, profiles, blog posts) in 12 languages';
