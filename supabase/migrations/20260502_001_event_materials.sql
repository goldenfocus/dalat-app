-- Event materials: supplementary content attached to events
-- Supports: YouTube videos, PDFs, audio files, video files, images, documents

-- Create enum for material types
CREATE TYPE material_type AS ENUM (
  'youtube',      -- YouTube video URL (auto-embedded)
  'pdf',          -- PDF documents (viewable/downloadable)
  'audio',        -- Audio files (MP3, M4A, WAV, OGG)
  'video',        -- Video files (MP4, WebM, MOV)
  'image',        -- Additional images (JPEG, PNG, WebP, GIF)
  'document'      -- Other documents (DOCX, XLSX, PPTX, etc.)
);

-- Create event_materials table
CREATE TABLE event_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  material_type material_type NOT NULL,

  -- For uploaded files
  file_url TEXT,                    -- Storage URL for uploaded files
  original_filename TEXT,           -- Original filename for downloads
  file_size BIGINT,                 -- File size in bytes
  mime_type TEXT,                   -- MIME type for proper handling

  -- For YouTube videos
  youtube_url TEXT,                 -- Full YouTube URL
  youtube_video_id TEXT,            -- Extracted video ID for embedding

  -- Display
  title TEXT,                       -- Optional title/label for the material
  description TEXT,                 -- Optional description
  sort_order INT NOT NULL DEFAULT 0,

  -- Metadata
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT material_has_content CHECK (
    (file_url IS NOT NULL) OR (youtube_url IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX idx_event_materials_event_id ON event_materials(event_id);
CREATE INDEX idx_event_materials_type ON event_materials(event_id, material_type);

-- Update timestamp trigger
CREATE TRIGGER update_event_materials_updated_at
  BEFORE UPDATE ON event_materials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS policies
ALTER TABLE event_materials ENABLE ROW LEVEL SECURITY;

-- Anyone can view materials for published events
CREATE POLICY "Anyone can view event materials"
ON event_materials FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_materials.event_id
    AND events.status = 'published'
  )
);

-- Event creator can insert materials
CREATE POLICY "Event creator can add materials"
ON event_materials FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_materials.event_id
    AND events.created_by = auth.uid()
  )
);

-- Event creator can update their materials
CREATE POLICY "Event creator can update materials"
ON event_materials FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_materials.event_id
    AND events.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_materials.event_id
    AND events.created_by = auth.uid()
  )
);

-- Event creator can delete materials
CREATE POLICY "Event creator can delete materials"
ON event_materials FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_materials.event_id
    AND events.created_by = auth.uid()
  )
);

-- Admins can manage all materials
CREATE POLICY "Admins can manage all materials"
ON event_materials FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'superadmin')
  )
);

-- Storage bucket for event materials
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-materials',
  'event-materials',
  true,  -- Public bucket for easy display
  104857600,  -- 100MB limit (for larger videos/PDFs)
  ARRAY[
    -- Images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    -- Videos
    'video/mp4',
    'video/webm',
    'video/quicktime',
    -- Audio
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/ogg',
    'audio/x-m4a',
    -- Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Helper function to check if user is the event creator for materials
CREATE OR REPLACE FUNCTION public.is_event_materials_owner(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM events
    WHERE id = (storage.foldername(object_name))[1]::uuid
    AND created_by = auth.uid()
  );
$$;

-- Storage policies for event-materials bucket

-- Allow event creators to upload materials to their event folder
CREATE POLICY "Event creator can upload materials"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-materials' AND
  public.is_event_materials_owner(name)
);

-- Allow event creators to update their materials
CREATE POLICY "Event creator can update materials"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-materials' AND
  public.is_event_materials_owner(name)
)
WITH CHECK (
  bucket_id = 'event-materials' AND
  public.is_event_materials_owner(name)
);

-- Allow event creators to delete their materials
CREATE POLICY "Event creator can delete materials"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-materials' AND
  public.is_event_materials_owner(name)
);

-- Allow public read access to all materials
CREATE POLICY "Anyone can view event materials files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-materials');
