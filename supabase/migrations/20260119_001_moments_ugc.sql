-- Moments UGC System
-- Per-event settings and user-generated content (photos, videos, text)

-- ============================================
-- TABLES
-- ============================================

-- Event settings for moments configuration
CREATE TABLE event_settings (
  event_id uuid PRIMARY KEY REFERENCES events ON DELETE CASCADE,
  moments_enabled boolean DEFAULT false,
  -- who_can_post: 'anyone' | 'rsvp' | 'confirmed' (going status)
  moments_who_can_post text DEFAULT 'anyone' CHECK (moments_who_can_post IN ('anyone', 'rsvp', 'confirmed')),
  moments_require_approval boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Moments table for UGC
CREATE TABLE moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  -- content_type: 'photo' | 'video' | 'text'
  content_type text NOT NULL CHECK (content_type IN ('photo', 'video', 'text')),
  media_url text,  -- URL to storage bucket (for photo/video)
  text_content text,  -- Caption or text-only content
  -- status: 'pending' | 'published' | 'rejected' | 'removed'
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected', 'removed')),
  moderation_note text,  -- Admin note for rejection reason
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Ensure media or text is provided based on type
  CONSTRAINT moments_content_check CHECK (
    (content_type IN ('photo', 'video') AND media_url IS NOT NULL) OR
    (content_type = 'text' AND text_content IS NOT NULL)
  )
);

CREATE INDEX idx_moments_event_id ON moments(event_id);
CREATE INDEX idx_moments_user_id ON moments(user_id);
CREATE INDEX idx_moments_status ON moments(status) WHERE status = 'published';
CREATE INDEX idx_moments_created_at ON moments(created_at DESC);

-- Updated_at trigger for event_settings
CREATE TRIGGER event_settings_updated_at BEFORE UPDATE ON event_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Updated_at trigger for moments
CREATE TRIGGER moments_updated_at BEFORE UPDATE ON moments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS POLICIES
-- ============================================

-- EVENT_SETTINGS
ALTER TABLE event_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read event settings (to check if moments enabled)
CREATE POLICY "event_settings_select_public"
ON event_settings FOR SELECT USING (true);

-- Only event creator can insert settings
CREATE POLICY "event_settings_insert_creator"
ON event_settings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_id
    AND events.created_by = auth.uid()
  )
);

-- Only event creator can update settings
CREATE POLICY "event_settings_update_creator"
ON event_settings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_id
    AND events.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_id
    AND events.created_by = auth.uid()
  )
);

-- MOMENTS
ALTER TABLE moments ENABLE ROW LEVEL SECURITY;

-- Published moments are visible to all
CREATE POLICY "moments_select_published"
ON moments FOR SELECT
USING (status = 'published');

-- Users can see their own moments (any status)
CREATE POLICY "moments_select_own"
ON moments FOR SELECT
USING (auth.uid() = user_id);

-- Event creators can see all moments for their events (for moderation)
CREATE POLICY "moments_select_event_creator"
ON moments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_id
    AND events.created_by = auth.uid()
  )
);

-- Helper function to check posting permissions
CREATE OR REPLACE FUNCTION can_post_moment(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_who_can_post text;
  v_moments_enabled boolean;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Get event settings
  SELECT moments_enabled, moments_who_can_post
  INTO v_moments_enabled, v_who_can_post
  FROM event_settings
  WHERE event_id = p_event_id;

  -- If no settings, check if event exists (allow with defaults for event creator)
  IF NOT FOUND THEN
    -- Check if user is event creator
    IF EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND created_by = v_uid) THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  IF NOT v_moments_enabled THEN
    RETURN false;
  END IF;

  -- Check permission based on who_can_post setting
  CASE v_who_can_post
    WHEN 'anyone' THEN
      RETURN true;
    WHEN 'rsvp' THEN
      RETURN EXISTS (
        SELECT 1 FROM rsvps
        WHERE event_id = p_event_id
        AND user_id = v_uid
        AND status IN ('going', 'waitlist', 'interested')
      );
    WHEN 'confirmed' THEN
      RETURN EXISTS (
        SELECT 1 FROM rsvps
        WHERE event_id = p_event_id
        AND user_id = v_uid
        AND status = 'going'
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- Users can insert moments if they have permission
CREATE POLICY "moments_insert_with_permission"
ON moments FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  public.can_post_moment(event_id)
);

-- Users can update their own pending moments
CREATE POLICY "moments_update_own_pending"
ON moments FOR UPDATE
USING (
  auth.uid() = user_id AND
  status = 'pending'
)
WITH CHECK (
  auth.uid() = user_id AND
  status = 'pending'
);

-- Event creators can moderate moments (update status)
CREATE POLICY "moments_update_event_creator"
ON moments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_id
    AND events.created_by = auth.uid()
  )
);

-- Users can delete their own moments
CREATE POLICY "moments_delete_own"
ON moments FOR DELETE
USING (auth.uid() = user_id);

-- Event creators can delete any moment from their event
CREATE POLICY "moments_delete_event_creator"
ON moments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_id
    AND events.created_by = auth.uid()
  )
);

-- ============================================
-- STORAGE BUCKET
-- ============================================

-- Create the moments bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'moments',
  'moments',
  true,  -- Public bucket for easy display
  52428800,  -- 50MB limit (for video)
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Helper function to check if user can upload to moments bucket
-- Storage path format: {event_id}/{user_id}/{timestamp}.{ext}
CREATE OR REPLACE FUNCTION public.can_upload_moment_media(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Extract event_id from path and check permission
    public.can_post_moment((storage.foldername(object_name))[1]::uuid)
    AND
    -- Ensure user is uploading to their own folder
    (storage.foldername(object_name))[2]::uuid = auth.uid();
$$;

-- Storage policies for moments bucket

-- Allow users to upload to their folder if they have permission
CREATE POLICY "User can upload moment media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'moments' AND
  public.can_upload_moment_media(name)
);

-- Allow users to update their own moment media
CREATE POLICY "User can update own moment media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'moments' AND
  (storage.foldername(name))[2]::uuid = auth.uid()
)
WITH CHECK (
  bucket_id = 'moments' AND
  (storage.foldername(name))[2]::uuid = auth.uid()
);

-- Allow users to delete their own moment media
CREATE POLICY "User can delete own moment media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'moments' AND
  (storage.foldername(name))[2]::uuid = auth.uid()
);

-- Allow public read access to all moment media
CREATE POLICY "Anyone can view moment media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'moments');

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Get published moments for an event (with pagination)
CREATE OR REPLACE FUNCTION get_event_moments(
  p_event_id uuid,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  user_id uuid,
  content_type text,
  media_url text,
  text_content text,
  created_at timestamptz,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.event_id,
    m.user_id,
    m.content_type,
    m.media_url,
    m.text_content,
    m.created_at,
    p.username,
    p.display_name,
    p.avatar_url
  FROM moments m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.event_id = p_event_id
    AND m.status = 'published'
  ORDER BY m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION get_event_moments(uuid, int, int) TO anon, authenticated;

-- Get moment counts for an event
CREATE OR REPLACE FUNCTION get_moment_counts(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_published int;
  v_pending int;
  v_is_creator boolean;
BEGIN
  SELECT count(*) FILTER (WHERE status = 'published')
  INTO v_published
  FROM moments
  WHERE event_id = p_event_id;

  -- Only include pending count if user is event creator
  v_is_creator := EXISTS (
    SELECT 1 FROM events
    WHERE id = p_event_id AND created_by = auth.uid()
  );

  IF v_is_creator THEN
    SELECT count(*) FILTER (WHERE status = 'pending')
    INTO v_pending
    FROM moments
    WHERE event_id = p_event_id;
  ELSE
    v_pending := 0;
  END IF;

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'published_count', v_published,
    'pending_count', v_pending
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_moment_counts(uuid) TO anon, authenticated;

-- Create a moment with auto-publish if no approval required
CREATE OR REPLACE FUNCTION create_moment(
  p_event_id uuid,
  p_content_type text,
  p_media_url text DEFAULT NULL,
  p_text_content text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_require_approval boolean;
  v_status text;
  v_moment_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Check if user can post
  IF NOT public.can_post_moment(p_event_id) THEN
    RAISE EXCEPTION 'not_allowed_to_post';
  END IF;

  -- Check if approval is required
  SELECT moments_require_approval
  INTO v_require_approval
  FROM event_settings
  WHERE event_id = p_event_id;

  -- Default to no approval if settings don't exist
  v_status := CASE WHEN COALESCE(v_require_approval, false) THEN 'pending' ELSE 'published' END;

  -- Insert the moment
  INSERT INTO moments (event_id, user_id, content_type, media_url, text_content, status)
  VALUES (p_event_id, v_uid, p_content_type, p_media_url, p_text_content, v_status)
  RETURNING id INTO v_moment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'moment_id', v_moment_id,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_moment(uuid, text, text, text) TO authenticated;
