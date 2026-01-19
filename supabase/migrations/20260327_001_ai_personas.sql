-- AI Personas: Reference-based character system for image generation
-- Allows @mentions in prompts to include reference photos of known people

-- ============================================
-- PERSONAS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text UNIQUE NOT NULL,
  name text NOT NULL,
  context text,
  style text,
  reference_images text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for handle lookups
CREATE INDEX IF NOT EXISTS idx_personas_handle ON personas(handle);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_personas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_personas_updated_at
  BEFORE UPDATE ON personas
  FOR EACH ROW
  EXECUTE FUNCTION update_personas_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

-- Anyone can read personas (needed for image generation)
CREATE POLICY "Personas are publicly readable"
  ON personas FOR SELECT
  USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can manage personas"
  ON personas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ============================================
-- STORAGE BUCKET
-- ============================================

-- Create bucket for persona reference images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'persona-references',
  'persona-references',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Anyone can view persona reference images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'persona-references');

CREATE POLICY "Admins can upload persona reference images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'persona-references'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update persona reference images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'persona-references'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can delete persona reference images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'persona-references'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE personas IS 'AI personas for @mention references in image generation';
COMMENT ON COLUMN personas.handle IS 'Unique handle for @mentions (lowercase, no spaces)';
COMMENT ON COLUMN personas.name IS 'Display name shown in prompts';
COMMENT ON COLUMN personas.context IS 'Brief context hint (e.g., "founder of the hackathon")';
COMMENT ON COLUMN personas.style IS 'Preferred rendering style (e.g., "friendly illustrated style")';
COMMENT ON COLUMN personas.reference_images IS 'URLs to reference photos in persona-references bucket';
