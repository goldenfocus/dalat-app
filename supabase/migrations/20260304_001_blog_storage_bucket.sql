-- Create storage bucket for blog media (cover images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-media',
  'blog-media',
  true,
  5242880,  -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "blog_media_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'blog-media');

-- Allow service role to upload (webhook uses service key)
CREATE POLICY "blog_media_service_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'blog-media');

-- Allow service role to update
CREATE POLICY "blog_media_service_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'blog-media');
