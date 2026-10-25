-- Keep per-file bookkeeping in database transactions instead of a chain of
-- transcontinental HTTP queries. Neither RPC is callable by a browser.
CREATE FUNCTION public.reserve_moment_upload(p_request jsonb, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id uuid := (p_request->>'eventId')::uuid;
  v_creator uuid;
  v_enabled boolean;
  v_who text;
  v_rsvp text;
  v_mime text := p_request->>'mime';
  v_ext text;
  u public.moment_uploads%ROWTYPE;
  v_created boolean;
BEGIN
  SELECT e.created_by, COALESCE(s.moments_enabled,true), COALESCE(s.moments_who_can_post,'anyone')
    INTO v_creator,v_enabled,v_who FROM events e LEFT JOIN event_settings s ON s.event_id=e.id WHERE e.id=v_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF NOT v_enabled THEN RAISE EXCEPTION 'moments_disabled'; END IF;
  SELECT status INTO v_rsvp FROM rsvps WHERE event_id=v_event_id AND user_id=p_user_id;
  IF v_creator IS DISTINCT FROM p_user_id AND (
    (v_who='rsvp' AND COALESCE(v_rsvp,'') NOT IN ('going','interested','waitlist')) OR
    (v_who='confirmed' AND COALESCE(v_rsvp,'')<>'going') OR v_who NOT IN ('anyone','rsvp','confirmed')
  ) THEN RAISE EXCEPTION 'not_allowed_to_post'; END IF;
  v_ext := CASE v_mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp' WHEN 'image/gif' THEN 'gif' WHEN 'image/heic' THEN 'heic' WHEN 'image/heif' THEN 'heif' END;
  INSERT INTO moment_uploads(id,batch_id,user_id,event_id,file_hash,filename,file_size,mime_type,captured_at,source_locale,object_path)
    VALUES ((p_request->>'id')::uuid,(p_request->>'batchId')::uuid,p_user_id,v_event_id,p_request->>'hash',
      p_request->>'name',(p_request->>'size')::bigint,v_mime,(p_request->>'capturedAt')::timestamptz,
      COALESCE(p_request->>'locale','en'),CASE WHEN v_ext IS NOT NULL THEN v_event_id::text||'/'||p_user_id::text||'/'||(p_request->>'id')||'.'||v_ext END)
    ON CONFLICT (user_id,event_id,file_hash) DO NOTHING RETURNING * INTO u;
  v_created := FOUND;
  IF NOT v_created THEN SELECT * INTO u FROM moment_uploads WHERE user_id=p_user_id AND event_id=v_event_id AND file_hash=p_request->>'hash'; END IF;
  RETURN jsonb_build_object('upload',to_jsonb(u),'created',v_created);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_moment_upload(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_moment_upload(jsonb,uuid) TO service_role;

CREATE FUNCTION public.complete_verified_moment_upload(
  p_upload_id uuid, p_media_url text DEFAULT NULL, p_video_ready boolean DEFAULT false,
  p_playback_url text DEFAULT NULL, p_thumbnail_url text DEFAULT NULL, p_duration double precision DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.moment_uploads%ROWTYPE; m public.moments%ROWTYPE;
BEGIN
  SELECT * INTO u FROM moment_uploads WHERE id=p_upload_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'upload_not_found'; END IF;
  UPDATE moment_uploads SET received_at=COALESCE(received_at,now()),media_url=COALESCE(p_media_url,media_url) WHERE id=u.id;
  PERFORM finish_moment_upload(u.id);
  SELECT * INTO u FROM moment_uploads WHERE id=u.id;
  IF u.cf_video_uid IS NOT NULL THEN
    UPDATE moments SET cf_video_uid=u.cf_video_uid,
      video_status=CASE WHEN p_video_ready THEN 'ready' ELSE 'processing' END,
      cf_playback_url=CASE WHEN p_video_ready THEN p_playback_url ELSE cf_playback_url END,
      thumbnail_url=COALESCE(p_thumbnail_url,thumbnail_url),
      video_duration_seconds=COALESCE(p_duration,video_duration_seconds)
      WHERE id=u.moment_id;
  END IF;
  SELECT * INTO m FROM moments WHERE id=u.moment_id;
  RETURN jsonb_build_object('id',u.id,'momentId',m.id,
    'status',CASE WHEN m.status='pending' THEN 'pending' WHEN u.cf_video_uid IS NOT NULL AND m.video_status<>'ready' THEN 'processing' ELSE 'published' END,
    'previewUrl',COALESCE(m.thumbnail_url,m.media_url));
END;
$$;
REVOKE ALL ON FUNCTION public.complete_verified_moment_upload(uuid,text,boolean,text,text,double precision) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_moment_upload(uuid,text,boolean,text,text,double precision) TO service_role;
