-- Live Streaming System
-- Enables live video broadcasting during "happening now" events
-- with real-time chat using Supabase Realtime

-- ============================================
-- TABLE: live_streams
-- ============================================

CREATE TABLE live_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  broadcaster_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Cloudflare Stream identifiers
  cf_live_input_id text, -- Cloudflare live input ID (internal)
  cf_stream_key text,    -- RTMPS stream key (secret, only shown to broadcaster)
  cf_playback_url text,  -- WHEP/HLS playback URL (public)

  -- Stream metadata
  title text,
  angle_label text DEFAULT 'Main', -- Short label: "Main", "Crowd", "DJ", etc.

  -- Stream state
  status text DEFAULT 'idle' CHECK (status IN (
    'idle',        -- Created but not streaming
    'connecting',  -- Broadcaster connecting
    'live',        -- Actively streaming
    'reconnecting', -- Temporary disconnect
    'ended'        -- Stream finished
  )),

  -- Viewer metrics (updated via webhooks or polling)
  current_viewers int DEFAULT 0,
  peak_viewers int DEFAULT 0,

  -- Timing
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Only one active stream per broadcaster per event
  CONSTRAINT unique_broadcaster_per_event UNIQUE (event_id, broadcaster_id)
);

CREATE INDEX idx_live_streams_event_id ON live_streams(event_id);
CREATE INDEX idx_live_streams_status ON live_streams(status) WHERE status = 'live';
CREATE INDEX idx_live_streams_broadcaster ON live_streams(broadcaster_id);

-- ============================================
-- TABLE: stream_chat_messages
-- ============================================

CREATE TABLE stream_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Message content
  content text NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),

  -- Message type
  message_type text DEFAULT 'text' CHECK (message_type IN (
    'text',     -- Normal chat message
    'system',   -- System message (stream started, etc.)
    'highlight' -- Pinned/highlighted message by moderator
  )),

  -- Moderation
  is_deleted boolean DEFAULT false,
  deleted_by uuid REFERENCES profiles(id),
  deleted_at timestamptz,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_stream_chat_event_created ON stream_chat_messages(event_id, created_at DESC);
CREATE INDEX idx_stream_chat_user ON stream_chat_messages(user_id);
-- Index for realtime queries (non-deleted messages)
CREATE INDEX idx_stream_chat_active ON stream_chat_messages(event_id, created_at DESC) WHERE is_deleted = false;

-- ============================================
-- RLS POLICIES: live_streams
-- ============================================

ALTER TABLE live_streams ENABLE ROW LEVEL SECURITY;

-- Anyone can view live streams for published events
CREATE POLICY "live_streams_select_public"
ON live_streams FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_id
    AND events.status = 'published'
  )
);

-- Event creators can create streams for their events
CREATE POLICY "live_streams_insert_event_creator"
ON live_streams FOR INSERT
WITH CHECK (
  auth.uid() = broadcaster_id AND
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_id
    AND events.created_by = auth.uid()
  )
);

-- Event creators can update streams for their events
CREATE POLICY "live_streams_update_event_creator"
ON live_streams FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_id
    AND events.created_by = auth.uid()
  )
);

-- Broadcasters can update their own stream (status, viewers)
CREATE POLICY "live_streams_update_own"
ON live_streams FOR UPDATE
USING (auth.uid() = broadcaster_id);

-- Event creators can delete streams
CREATE POLICY "live_streams_delete_event_creator"
ON live_streams FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_id
    AND events.created_by = auth.uid()
  )
);

-- ============================================
-- RLS POLICIES: stream_chat_messages
-- ============================================

ALTER TABLE stream_chat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read non-deleted chat messages
CREATE POLICY "stream_chat_select_public"
ON stream_chat_messages FOR SELECT
USING (is_deleted = false);

-- Authenticated users can send messages
CREATE POLICY "stream_chat_insert_authenticated"
ON stream_chat_messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can soft-delete their own messages
CREATE POLICY "stream_chat_update_own"
ON stream_chat_messages FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Event creators can moderate (delete) any message in their event's stream
CREATE POLICY "stream_chat_moderate_event_creator"
ON stream_chat_messages FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = stream_chat_messages.event_id
    AND events.created_by = auth.uid()
  )
);

-- ============================================
-- ENABLE SUPABASE REALTIME
-- ============================================

-- Enable realtime for live stream status updates
ALTER PUBLICATION supabase_realtime ADD TABLE live_streams;

-- Enable realtime for chat messages
ALTER PUBLICATION supabase_realtime ADD TABLE stream_chat_messages;

-- ============================================
-- RPC: Create a live stream for an event
-- ============================================

CREATE OR REPLACE FUNCTION create_live_stream(
  p_event_id uuid,
  p_title text DEFAULT NULL,
  p_angle_label text DEFAULT 'Main'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_event_creator uuid;
  v_event_status text;
  v_stream_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Verify event exists and user is the creator
  SELECT created_by, status
  INTO v_event_creator, v_event_status
  FROM events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  IF v_event_creator <> v_uid THEN
    RAISE EXCEPTION 'not_event_creator';
  END IF;

  IF v_event_status <> 'published' THEN
    RAISE EXCEPTION 'event_not_published';
  END IF;

  -- Check if user already has a stream for this event
  IF EXISTS (
    SELECT 1 FROM live_streams
    WHERE event_id = p_event_id AND broadcaster_id = v_uid
  ) THEN
    RAISE EXCEPTION 'stream_already_exists';
  END IF;

  -- Create the stream record (Cloudflare details will be added via API)
  INSERT INTO live_streams (event_id, broadcaster_id, title, angle_label)
  VALUES (p_event_id, v_uid, p_title, p_angle_label)
  RETURNING id INTO v_stream_id;

  RETURN jsonb_build_object(
    'ok', true,
    'stream_id', v_stream_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_live_stream(uuid, text, text) TO authenticated;

-- ============================================
-- RPC: Update stream status
-- ============================================

CREATE OR REPLACE FUNCTION update_stream_status(
  p_stream_id uuid,
  p_status text,
  p_current_viewers int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_stream record;
  v_new_peak int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get stream and verify ownership
  SELECT * INTO v_stream
  FROM live_streams
  WHERE id = p_stream_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stream_not_found';
  END IF;

  IF v_stream.broadcaster_id <> v_uid THEN
    RAISE EXCEPTION 'not_stream_owner';
  END IF;

  -- Validate status
  IF p_status NOT IN ('idle', 'connecting', 'live', 'reconnecting', 'ended') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  -- Calculate new peak viewers
  v_new_peak := GREATEST(v_stream.peak_viewers, COALESCE(p_current_viewers, 0));

  -- Update stream
  UPDATE live_streams
  SET
    status = p_status,
    current_viewers = COALESCE(p_current_viewers, current_viewers),
    peak_viewers = v_new_peak,
    started_at = CASE
      WHEN p_status = 'live' AND started_at IS NULL THEN now()
      ELSE started_at
    END,
    ended_at = CASE
      WHEN p_status = 'ended' THEN now()
      ELSE ended_at
    END,
    updated_at = now()
  WHERE id = p_stream_id;

  RETURN jsonb_build_object(
    'ok', true,
    'stream_id', p_stream_id,
    'status', p_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_stream_status(uuid, text, int) TO authenticated;

-- ============================================
-- RPC: Get active streams for an event
-- ============================================

CREATE OR REPLACE FUNCTION get_event_streams(p_event_id uuid)
RETURNS TABLE (
  id uuid,
  broadcaster_id uuid,
  broadcaster_name text,
  broadcaster_avatar text,
  title text,
  angle_label text,
  status text,
  cf_playback_url text,
  current_viewers int,
  started_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ls.id,
    ls.broadcaster_id,
    p.full_name AS broadcaster_name,
    p.avatar_url AS broadcaster_avatar,
    ls.title,
    ls.angle_label,
    ls.status,
    ls.cf_playback_url,
    ls.current_viewers,
    ls.started_at
  FROM live_streams ls
  JOIN profiles p ON p.id = ls.broadcaster_id
  WHERE ls.event_id = p_event_id
    AND ls.status IN ('connecting', 'live', 'reconnecting')
  ORDER BY ls.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_event_streams(uuid) TO anon, authenticated;

-- ============================================
-- RPC: Send chat message
-- ============================================

CREATE OR REPLACE FUNCTION send_stream_chat_message(
  p_event_id uuid,
  p_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_message_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Validate content
  IF p_content IS NULL OR char_length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'empty_message';
  END IF;

  IF char_length(p_content) > 500 THEN
    RAISE EXCEPTION 'message_too_long';
  END IF;

  -- Verify event exists and is published
  IF NOT EXISTS (
    SELECT 1 FROM events
    WHERE id = p_event_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  -- Insert message
  INSERT INTO stream_chat_messages (event_id, user_id, content, message_type)
  VALUES (p_event_id, v_uid, trim(p_content), 'text')
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object(
    'ok', true,
    'message_id', v_message_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION send_stream_chat_message(uuid, text) TO authenticated;

-- ============================================
-- RPC: Delete chat message (soft delete)
-- ============================================

CREATE OR REPLACE FUNCTION delete_stream_chat_message(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_message record;
  v_is_event_creator boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get message
  SELECT * INTO v_message
  FROM stream_chat_messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found';
  END IF;

  -- Check if user is message owner or event creator
  SELECT EXISTS (
    SELECT 1 FROM events
    WHERE id = v_message.event_id AND created_by = v_uid
  ) INTO v_is_event_creator;

  IF v_message.user_id <> v_uid AND NOT v_is_event_creator THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Soft delete
  UPDATE stream_chat_messages
  SET
    is_deleted = true,
    deleted_by = v_uid,
    deleted_at = now()
  WHERE id = p_message_id;

  RETURN jsonb_build_object(
    'ok', true,
    'message_id', p_message_id,
    'deleted', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION delete_stream_chat_message(uuid) TO authenticated;

-- ============================================
-- RPC: Get recent chat messages for an event
-- ============================================

CREATE OR REPLACE FUNCTION get_stream_chat_messages(
  p_event_id uuid,
  p_limit int DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_name text,
  user_avatar text,
  content text,
  message_type text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    p.full_name AS user_name,
    p.avatar_url AS user_avatar,
    m.content,
    m.message_type,
    m.created_at
  FROM stream_chat_messages m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.event_id = p_event_id
    AND m.is_deleted = false
    AND (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_stream_chat_messages(uuid, int, timestamptz) TO anon, authenticated;

-- ============================================
-- TRIGGER: Update updated_at on live_streams
-- ============================================

CREATE OR REPLACE FUNCTION update_live_streams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER live_streams_updated_at
  BEFORE UPDATE ON live_streams
  FOR EACH ROW
  EXECUTE FUNCTION update_live_streams_updated_at();
