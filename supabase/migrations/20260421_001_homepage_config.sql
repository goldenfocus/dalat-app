-- Homepage configuration table for admin-controlled hero section
-- v1: Image-only, text customization can be added later

CREATE TABLE homepage_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_image_url TEXT,                    -- The main hero background image (null = use minimal text hero)
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

-- RLS policies
ALTER TABLE homepage_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read homepage config (needed for public homepage)
CREATE POLICY "Anyone can read homepage config"
  ON homepage_config
  FOR SELECT
  USING (true);

-- Only admins can update homepage config
CREATE POLICY "Admins can update homepage config"
  ON homepage_config
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
    )
  );

-- Only admins can insert homepage config (shouldn't normally happen after initial seed)
CREATE POLICY "Admins can insert homepage config"
  ON homepage_config
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
    )
  );

-- Insert default row (no image initially - will use minimal text hero)
INSERT INTO homepage_config (id) VALUES (gen_random_uuid());

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_homepage_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER homepage_config_updated_at
  BEFORE UPDATE ON homepage_config
  FOR EACH ROW
  EXECUTE FUNCTION update_homepage_config_timestamp();

-- Add comment for documentation
COMMENT ON TABLE homepage_config IS 'Admin-controlled homepage settings. Single row table for hero image and future customizations.';

-- Create storage bucket for site assets (hero images, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-assets', 'site-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for site-assets bucket
-- Anyone can read (public bucket)
CREATE POLICY "Anyone can view site assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'site-assets');

-- Admins can upload/update/delete
CREATE POLICY "Admins can manage site assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'site-assets'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Admins can update site assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'site-assets'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Admins can delete site assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'site-assets'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);
