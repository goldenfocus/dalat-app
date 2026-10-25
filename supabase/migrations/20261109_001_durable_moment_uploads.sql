-- One receipt per contributor/event/content hash. Uploading is distinct from
-- publishing; only the server may mark a verified object as received.
CREATE TABLE public.moment_uploads (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  file_hash text NOT NULL CHECK (file_hash ~ '^[a-f0-9]{64}$'),
  filename text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 524288000),
  mime_type text NOT NULL,
  captured_at timestamptz,
  source_locale text NOT NULL DEFAULT 'en',
  object_path text,
  media_url text,
  cf_video_uid text,
  upload_url text,
  moment_id uuid REFERENCES public.moments(id) ON DELETE SET NULL,
  received_at timestamptz,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id, file_hash)
);
ALTER TABLE public.moment_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moment_uploads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.moment_uploads TO service_role;
CREATE INDEX moment_uploads_unfinished ON public.moment_uploads(last_checked_at)
  WHERE moment_id IS NULL;
CREATE UNIQUE INDEX moment_uploads_video ON public.moment_uploads(cf_video_uid)
  WHERE cf_video_uid IS NOT NULL;

-- Service-only, transactional finalization. A retry after a lost HTTP response
-- returns the same moment; existing moderation and posting permissions apply.
CREATE FUNCTION public.finish_moment_upload(p_upload_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u public.moment_uploads%ROWTYPE;
  v_creator uuid;
  v_enabled boolean;
  v_who text;
  v_approval boolean;
  v_rsvp text;
  v_status text;
  v_existing uuid;
BEGIN
  SELECT * INTO u FROM public.moment_uploads WHERE id = p_upload_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'upload_not_found'; END IF;
  IF u.moment_id IS NOT NULL THEN
    RETURN jsonb_build_object('moment_id', u.moment_id);
  END IF;
  IF u.received_at IS NULL THEN RAISE EXCEPTION 'upload_not_received'; END IF;

  SELECT e.created_by, COALESCE(s.moments_enabled, true),
    COALESCE(s.moments_who_can_post, 'anyone'), COALESCE(s.moments_require_approval, false)
    INTO v_creator, v_enabled, v_who, v_approval
    FROM public.events e LEFT JOIN public.event_settings s ON s.event_id = e.id
    WHERE e.id = u.event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF NOT v_enabled THEN RAISE EXCEPTION 'moments_disabled'; END IF;
  SELECT status INTO v_rsvp FROM public.rsvps WHERE event_id = u.event_id AND user_id = u.user_id;
  IF v_creator IS DISTINCT FROM u.user_id AND (
    (v_who = 'rsvp' AND COALESCE(v_rsvp, '') NOT IN ('going', 'interested', 'waitlist')) OR
    (v_who = 'confirmed' AND COALESCE(v_rsvp, '') <> 'going') OR
    v_who NOT IN ('anyone', 'rsvp', 'confirmed')
  ) THEN RAISE EXCEPTION 'not_allowed_to_post'; END IF;
  v_status := CASE WHEN v_approval AND v_creator IS DISTINCT FROM u.user_id THEN 'pending' ELSE 'published' END;

  -- Also recognize older uploads that already carry the original's hash.
  SELECT id INTO v_existing FROM public.moments
    WHERE event_id = u.event_id AND user_id = u.user_id AND file_hash = u.file_hash
      AND status IN ('published', 'pending') ORDER BY created_at LIMIT 1;
  IF v_existing IS NULL THEN
    INSERT INTO public.moments (
      event_id, user_id, content_type, media_url, status, source_locale,
      cf_video_uid, video_status, file_hash, captured_at, original_filename, file_size, mime_type
    ) VALUES (
      u.event_id, u.user_id, CASE WHEN u.cf_video_uid IS NULL THEN 'photo' ELSE 'video' END,
      u.media_url, v_status, u.source_locale, u.cf_video_uid,
      CASE WHEN u.cf_video_uid IS NULL THEN 'ready' ELSE 'processing' END,
      u.file_hash, u.captured_at, u.filename, u.file_size, u.mime_type
    ) RETURNING id INTO v_existing;
  END IF;
  UPDATE public.moment_uploads SET moment_id = v_existing WHERE id = u.id;
  RETURN jsonb_build_object('moment_id', v_existing, 'status', v_status);
END;
$$;
REVOKE ALL ON FUNCTION public.finish_moment_upload(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_moment_upload(uuid) TO service_role;
