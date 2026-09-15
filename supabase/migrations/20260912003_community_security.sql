-- Additive ownership history; legacy created_by is the current owner.
BEGIN;
ALTER TABLE public.tribes ADD COLUMN IF NOT EXISTS founder_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
UPDATE public.tribes SET founder_id=created_by WHERE founder_id IS NULL;
COMMENT ON COLUMN public.tribes.created_by IS 'Current community owner. Transfer through transfer_community_ownership; founder_id preserves history.';

-- Invoker triggers distinguish untrusted Data API writes from trusted SQL/RPCs.
CREATE OR REPLACE FUNCTION public.guard_community_membership() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); tid uuid; target uuid; owner_id uuid;
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role') THEN RETURN COALESCE(NEW,OLD); END IF;
  tid:=CASE WHEN TG_OP='DELETE' THEN OLD.tribe_id ELSE NEW.tribe_id END;
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  SELECT created_by INTO owner_id FROM tribes WHERE id=tid;
  IF TG_OP='DELETE' AND NOT FOUND THEN RETURN OLD; END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' THEN
    IF actor=owner_id THEN RETURN NEW; END IF;
    IF NEW.role<>'member' OR NEW.status<>'active' THEN RAISE EXCEPTION 'Only the owner can assign roles' USING ERRCODE='42501'; END IF;
    IF is_tribe_admin(tid,actor) THEN RETURN NEW; END IF;
    IF target<>actor OR NEW.invited_by IS NOT NULL THEN RAISE EXCEPTION 'Invalid membership' USING ERRCODE='42501'; END IF;
    RETURN NEW; -- RLS additionally requires a public community.
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.tribe_id<>OLD.tribe_id OR NEW.invited_by IS DISTINCT FROM OLD.invited_by OR NEW.joined_at IS DISTINCT FROM OLD.joined_at) THEN
    RAISE EXCEPTION 'Membership identity cannot change' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND target=actor AND (to_jsonb(NEW)-'show_on_profile')=(to_jsonb(OLD)-'show_on_profile') THEN RETURN NEW; END IF;
  IF target=owner_id THEN RAISE EXCEPTION 'Transfer ownership first' USING ERRCODE='42501'; END IF;
  IF actor=owner_id THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_OP='DELETE' AND target=actor AND OLD.status='active' THEN RETURN OLD; END IF;
  IF NOT is_tribe_admin(tid,actor) OR OLD.role<>'member' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND NEW.role<>OLD.role THEN RAISE EXCEPTION 'Only the owner can assign roles' USING ERRCODE='42501'; END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS guard_community_membership ON public.tribe_members;
CREATE TRIGGER guard_community_membership BEFORE INSERT OR UPDATE OR DELETE ON public.tribe_members FOR EACH ROW EXECUTE FUNCTION public.guard_community_membership();

CREATE OR REPLACE FUNCTION public.guard_community_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.founder_id:=NEW.created_by;
 ELSIF current_user NOT IN ('postgres','supabase_admin','service_role') AND (NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.founder_id IS DISTINCT FROM OLD.founder_id) THEN
  RAISE EXCEPTION 'Use ownership transfer' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_community_owner ON public.tribes;
CREATE TRIGGER guard_community_owner BEFORE INSERT OR UPDATE ON public.tribes FOR EACH ROW EXECUTE FUNCTION public.guard_community_owner();
DROP POLICY IF EXISTS tribes_update_creator ON public.tribes;
CREATE POLICY tribes_update_creator ON public.tribes FOR UPDATE USING (is_tribe_admin(id)) WITH CHECK (is_tribe_admin(id));

CREATE OR REPLACE FUNCTION public.transfer_community_ownership(p_slug text,p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t tribes%ROWTYPE;
BEGIN
 SELECT * INTO t FROM tribes WHERE slug=p_slug FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS DISTINCT FROM t.created_by THEN RAISE EXCEPTION 'Only the owner can transfer ownership' USING ERRCODE='42501'; END IF;
 IF p_user_id=auth.uid() THEN RETURN; END IF;
 PERFORM 1 FROM tribe_members WHERE tribe_id=t.id AND user_id=p_user_id AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active member'; END IF;
 UPDATE tribes SET created_by=p_user_id WHERE id=t.id;
 UPDATE tribe_members SET role='member' WHERE tribe_id=t.id AND user_id=auth.uid();
 UPDATE tribe_members SET role='leader' WHERE tribe_id=t.id AND user_id=p_user_id;
END $$;
REVOKE ALL ON FUNCTION public.transfer_community_ownership(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_community_ownership(text,uuid) TO authenticated;

-- Prevent self-promotion through the profile table from bypassing all community checks.
CREATE OR REPLACE FUNCTION public.guard_profile_authority() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user IN ('postgres','supabase_admin','service_role') OR is_admin() THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF COALESCE(NEW.role,'user')<>'user' OR COALESCE(NEW.is_ghost,false) OR COALESCE(NEW.can_blog,false) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_ghost IS DISTINCT FROM OLD.is_ghost OR NEW.can_blog IS DISTINCT FROM OLD.can_blog THEN
  RAISE EXCEPTION 'Not authorized to change account permissions' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_profile_authority ON public.profiles;
CREATE TRIGGER guard_profile_authority BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_authority();

CREATE OR REPLACE FUNCTION public.join_community(p_slug text,p_invite_code text DEFAULT NULL,p_message text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t tribes%ROWTYPE; m tribe_members%ROWTYPE; req_id uuid; valid_code boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM tribes WHERE slug=p_slug FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Community not found'; END IF;
 SELECT * INTO m FROM tribe_members WHERE tribe_id=t.id AND user_id=auth.uid();
 IF m.status='banned' THEN RAISE EXCEPTION 'You are banned from this community' USING ERRCODE='42501'; END IF;
 IF m.status='active' THEN RETURN jsonb_build_object('success',true,'status','joined','alreadyMember',true); END IF;
 IF p_invite_code IS NOT NULL THEN
  SELECT EXISTS(SELECT 1 FROM community_invite_secrets WHERE tribe_id=t.id AND code=upper(p_invite_code) AND (expires_at IS NULL OR expires_at>now())) INTO valid_code;
  IF NOT COALESCE(valid_code,false) THEN RAISE EXCEPTION 'Invalid or expired invite code'; END IF;
 END IF;
 IF t.access_type='public' OR valid_code THEN
  INSERT INTO tribe_members(tribe_id,user_id) VALUES(t.id,auth.uid()) ON CONFLICT(tribe_id,user_id) DO NOTHING;
  RETURN jsonb_build_object('success',true,'status','joined');
 ELSIF t.access_type='request' THEN
  INSERT INTO tribe_requests(tribe_id,user_id,message) VALUES(t.id,auth.uid(),left(nullif(trim(p_message),''),1000))
  ON CONFLICT(tribe_id,user_id) DO UPDATE SET status='pending',message=EXCLUDED.message,reviewed_by=NULL,reviewed_at=NULL
  WHERE tribe_requests.status IN ('cancelled','rejected') RETURNING id INTO req_id;
  RETURN jsonb_build_object('success',true,'status','requested');
 END IF;
 RAISE EXCEPTION 'Invitation required' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.join_community(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_community(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_community_request(p_slug text,p_request_id uuid,p_approve boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t tribes%ROWTYPE; r tribe_requests%ROWTYPE;
BEGIN
 SELECT * INTO t FROM tribes WHERE slug=p_slug FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT is_tribe_admin(t.id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM tribe_requests WHERE id=p_request_id AND tribe_id=t.id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'Request not pending'; END IF;
 IF p_approve THEN
  IF is_tribe_banned(t.id,r.user_id) THEN RAISE EXCEPTION 'Member is banned'; END IF;
  INSERT INTO tribe_members(tribe_id,user_id) VALUES(t.id,r.user_id) ON CONFLICT(tribe_id,user_id) DO NOTHING;
 END IF;
 UPDATE tribe_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=r.id;
 RETURN r.user_id;
END $$;
REVOKE ALL ON FUNCTION public.review_community_request(text,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_community_request(text,uuid,boolean) TO authenticated;

-- Self-service requests can only be created pending or cancelled; not approved.
CREATE OR REPLACE FUNCTION public.guard_community_request() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user IN ('postgres','supabase_admin','service_role') THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='42501'; END IF;
 ELSE
  IF NEW.status<>'cancelled' OR OLD.status<>'pending' OR NEW.user_id<>auth.uid() OR (to_jsonb(NEW)-'status')<>(to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Use request review' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_community_request ON public.tribe_requests;
CREATE TRIGGER guard_community_request BEFORE INSERT OR UPDATE ON public.tribe_requests FOR EACH ROW EXECUTE FUNCTION public.guard_community_request();

ALTER TABLE public.tribe_invitations ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now()+interval '30 days');
ALTER TABLE public.tribe_invitations ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
CREATE OR REPLACE FUNCTION public.accept_community_invitation(p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i tribe_invitations%ROWTYPE; t tribes%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM tribe_invitations WHERE token=p_token FOR UPDATE;
 IF NOT FOUND OR i.revoked_at IS NOT NULL OR i.expires_at<=now() THEN RAISE EXCEPTION 'Invalid or expired invitation'; END IF;
 IF i.claimed_by IS NOT NULL AND i.claimed_by<>auth.uid() THEN RAISE EXCEPTION 'Invitation belongs to another account' USING ERRCODE='42501'; END IF;
 IF i.status NOT IN ('pending','sent','viewed','accepted') THEN RAISE EXCEPTION 'Invalid invitation'; END IF;
 SELECT * INTO t FROM tribes WHERE id=i.tribe_id FOR UPDATE;
 IF NOT FOUND OR NOT is_tribe_admin(t.id,i.invited_by) THEN RAISE EXCEPTION 'Invitation no longer valid'; END IF;
 IF is_tribe_banned(t.id) THEN RAISE EXCEPTION 'You are banned from this community' USING ERRCODE='42501'; END IF;
 INSERT INTO tribe_members(tribe_id,user_id,invited_by) VALUES(t.id,auth.uid(),i.invited_by) ON CONFLICT(tribe_id,user_id) DO NOTHING;
 UPDATE tribe_invitations SET status='accepted',claimed_by=auth.uid(),accepted_at=COALESCE(accepted_at,now()) WHERE id=i.id;
 RETURN jsonb_build_object('success',true,'slug',t.slug);
END $$;
REVOKE ALL ON FUNCTION public.accept_community_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_community_invitation(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_community_invitation() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin','service_role') AND NOT is_tribe_admin(OLD.tribe_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_community_invitation ON public.tribe_invitations;
CREATE TRIGGER guard_community_invitation BEFORE UPDATE ON public.tribe_invitations FOR EACH ROW EXECUTE FUNCTION public.guard_community_invitation();

-- Community association never implicitly authorizes hosting under another owner.
CREATE OR REPLACE FUNCTION public.guard_event_community() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin','service_role') AND NOT is_admin() AND NEW.tribe_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.tribe_id IS DISTINCT FROM OLD.tribe_id) AND NOT is_tribe_admin(NEW.tribe_id) THEN
  RAISE EXCEPTION 'Not authorized to host for this community' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_event_community ON public.events;
CREATE TRIGGER guard_event_community BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.guard_event_community();

-- Attendance remains public for public events, hidden when the event is hidden.
DROP POLICY IF EXISTS rsvps_select_public ON public.rsvps;
CREATE POLICY rsvps_select_public ON public.rsvps FOR SELECT USING (user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.events e WHERE e.id=event_id));


-- Invite secrets are not columns in an anonymously readable community row.
CREATE TABLE IF NOT EXISTS public.community_invite_secrets (
 tribe_id uuid PRIMARY KEY REFERENCES public.tribes(id) ON DELETE CASCADE,
 code text UNIQUE NOT NULL, expires_at timestamptz
);
ALTER TABLE public.community_invite_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_invite_secrets FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.community_invite_secrets TO service_role;
INSERT INTO public.community_invite_secrets(tribe_id,code,expires_at)
 SELECT id,invite_code,invite_code_expires_at FROM public.tribes WHERE invite_code IS NOT NULL
 ON CONFLICT(tribe_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.set_tribe_invite_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.invite_code:=NULL; NEW.invite_code_expires_at:=NULL;
 IF NEW.access_type='secret' THEN NEW.is_listed:=false; END IF;
 RETURN NEW;
END $$;
UPDATE public.tribes SET invite_code=NULL,invite_code_expires_at=NULL WHERE invite_code IS NOT NULL;
CREATE OR REPLACE FUNCTION public.create_community_invite_secret() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.access_type IN ('invite_only','secret') THEN
  INSERT INTO community_invite_secrets(tribe_id,code) VALUES(NEW.id,upper(replace(gen_random_uuid()::text,'-',''))) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS create_community_invite_secret ON public.tribes;
CREATE TRIGGER create_community_invite_secret AFTER INSERT OR UPDATE ON public.tribes FOR EACH ROW EXECUTE FUNCTION public.create_community_invite_secret();
CREATE OR REPLACE FUNCTION public.get_tribe_by_code(p_code text) RETURNS SETOF public.tribes LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT t.* FROM tribes t JOIN community_invite_secrets s ON s.tribe_id=t.id
 WHERE s.code=upper(p_code) AND (s.expires_at IS NULL OR s.expires_at>now());
$$;
CREATE OR REPLACE FUNCTION public.get_community_invite_code(p_tribe_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT is_tribe_admin(p_tribe_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN (SELECT code FROM community_invite_secrets WHERE tribe_id=p_tribe_id);
END $$;
CREATE OR REPLACE FUNCTION public.regenerate_tribe_invite_code(p_tribe_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c text:=upper(replace(gen_random_uuid()::text,'-',''));
BEGIN
 IF auth.uid() IS NULL OR NOT is_tribe_admin(p_tribe_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 INSERT INTO community_invite_secrets(tribe_id,code) VALUES(p_tribe_id,c)
 ON CONFLICT(tribe_id) DO UPDATE SET code=EXCLUDED.code,expires_at=NULL;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.get_community_invite_code(uuid),public.regenerate_tribe_invite_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_community_invite_code(uuid),public.regenerate_tribe_invite_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rsvp_event(p_event_id uuid, p_plus_ones integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_capacity int;
  v_status text;
  v_event_status text;
  v_spots_taken_excl_me int;
  v_rsvp_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_plus_ones < 0 THEN
    RAISE EXCEPTION 'invalid_plus_ones';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM events e WHERE e.id=p_event_id AND
    (e.created_by=v_uid OR is_admin() OR (e.status='published' AND
      (e.tribe_id IS NULL OR e.tribe_visibility='public' OR is_tribe_member(e.tribe_id,v_uid))))) THEN
    RAISE EXCEPTION 'Event not available' USING ERRCODE='42501';
  END IF;

  -- Check if event is past (fast rejection before locking)
  IF is_event_past(p_event_id) THEN
    RAISE EXCEPTION 'event_has_ended';
  END IF;

  -- Lock event row to serialize capacity decisions
  SELECT capacity, status
  INTO v_capacity, v_event_status
  FROM events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  IF v_event_status <> 'published' THEN
    RAISE EXCEPTION 'event_not_published';
  END IF;

  -- Spots taken EXCLUDING caller (so +1 updates work correctly)
  SELECT coalesce(sum(1 + plus_ones), 0)
  INTO v_spots_taken_excl_me
  FROM rsvps
  WHERE event_id = p_event_id
    AND status = 'going'
    AND user_id <> v_uid;

  IF v_capacity IS NULL OR (v_spots_taken_excl_me + 1 + p_plus_ones) <= v_capacity THEN
    v_status := 'going';
  ELSE
    v_status := 'waitlist';
  END IF;

  INSERT INTO rsvps (event_id, user_id, status, plus_ones)
  VALUES (p_event_id, v_uid, v_status, p_plus_ones)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET status = EXCLUDED.status,
        plus_ones = EXCLUDED.plus_ones
  RETURNING id INTO v_rsvp_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_status,
    'rsvp_id', v_rsvp_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_community_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO tribe_members(tribe_id,user_id,role) VALUES(NEW.id,NEW.created_by,'leader') ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER add_community_owner AFTER INSERT ON public.tribes FOR EACH ROW EXECUTE FUNCTION public.add_community_owner();
CREATE OR REPLACE FUNCTION public.get_tribe_invitation_by_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', ti.id,
    'email', ti.email,
    'name', ti.name,
    'status', ti.status,
    'claimed_by', ti.claimed_by,
    'personal_note', ti.personal_note,
    'accepted_at', ti.accepted_at,
    'tribe', jsonb_build_object(
      'id', t.id,
      'slug', t.slug,
      'name', t.name,
      'description', t.description,
      'cover_image_url', t.cover_image_url,
      'access_type', t.access_type,
      'settings', t.settings,
      'member_count', t.member_count
    ),
    'inviter', jsonb_build_object(
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url
    )
  ) INTO v_result
  FROM tribe_invitations ti
  JOIN tribes t ON t.id = ti.tribe_id
  LEFT JOIN profiles p ON p.id = ti.invited_by
  WHERE ti.token = p_token AND ti.revoked_at IS NULL AND (ti.expires_at IS NULL OR ti.expires_at > now()) AND is_tribe_admin(t.id,ti.invited_by);

  -- Read receipt lives here, not in the page. An anonymous invitee cannot
  -- satisfy `tribe_invitations_update` (invited_by / claimed_by / tribe admin),
  -- so an UPDATE from the landing page would silently no-op forever.
  UPDATE tribe_invitations
  SET status = 'viewed', viewed_at = now()
  WHERE token = p_token AND status = 'sent' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now());

  -- Deliberately does NOT return tribes.invite_code. That code grants instant
  -- membership via /api/tribes/[slug]/membership; an invitation token is
  -- single-tribe and revocable, an invite_code is neither.
  RETURN v_result;
END;
$function$
;
COMMIT;
