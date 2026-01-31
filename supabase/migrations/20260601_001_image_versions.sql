-- Image version history for AI-generated images
-- Keeps last 5 versions per content item with restore capability

-- Create the image_versions table
CREATE TABLE image_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('event', 'blog', 'profile', 'venue', 'organizer')),
  content_id uuid NOT NULL,
  field_name text NOT NULL CHECK (field_name IN ('cover_image', 'avatar', 'logo')),
  image_url text NOT NULL,
  alt text,
  description text,
  keywords text[],
  colors text[],
  generation_prompt text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Index for fast lookups (get versions for a specific content item)
CREATE INDEX idx_image_versions_lookup
  ON image_versions(content_type, content_id, field_name, created_at DESC);

-- Index for cleanup queries
CREATE INDEX idx_image_versions_cleanup
  ON image_versions(content_type, content_id, field_name, id);

-- Enable RLS
ALTER TABLE image_versions ENABLE ROW LEVEL SECURITY;

-- RLS policies
-- Anyone can read image versions (images are public)
CREATE POLICY "Anyone can view image versions"
  ON image_versions FOR SELECT
  USING (true);

-- Users can insert versions for content they own
CREATE POLICY "Users can create versions for their content"
  ON image_versions FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Users can delete versions they created
CREATE POLICY "Users can delete their own versions"
  ON image_versions FOR DELETE
  USING (auth.uid() = created_by);

-- Cleanup trigger: keep only the last 5 versions per content item
CREATE OR REPLACE FUNCTION cleanup_old_image_versions()
RETURNS trigger AS $$
BEGIN
  -- Delete versions beyond the 5 most recent for this content item
  DELETE FROM image_versions
  WHERE content_type = NEW.content_type
    AND content_id = NEW.content_id
    AND field_name = NEW.field_name
    AND id NOT IN (
      SELECT id FROM image_versions
      WHERE content_type = NEW.content_type
        AND content_id = NEW.content_id
        AND field_name = NEW.field_name
      ORDER BY created_at DESC
      LIMIT 5
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_cleanup_image_versions
  AFTER INSERT ON image_versions
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_old_image_versions();

-- Add SEO metadata columns to events (matching blog_posts pattern)
ALTER TABLE events
ADD COLUMN IF NOT EXISTS image_alt text,
ADD COLUMN IF NOT EXISTS image_description text,
ADD COLUMN IF NOT EXISTS image_keywords text[],
ADD COLUMN IF NOT EXISTS image_colors text[];

-- Add comment for documentation
COMMENT ON TABLE image_versions IS 'Stores history of AI-generated images for rollback capability. Auto-cleans to keep last 5 versions.';
COMMENT ON COLUMN image_versions.content_type IS 'Type of content: event, blog, profile, venue, organizer';
COMMENT ON COLUMN image_versions.field_name IS 'Which image field: cover_image, avatar, logo';
COMMENT ON COLUMN image_versions.generation_prompt IS 'The prompt used to generate this image (for reproducibility)';
