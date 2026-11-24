BEGIN;

-- A default handle must not expose an email address, phone number or provider ID.
CREATE FUNCTION public.assign_profile_username()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  candidate text;
  attempt integer := 0;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.username IS NOT NULL AND NEW.username = OLD.username THEN
    RETURN NEW;
  END IF;

  IF nullif(btrim(NEW.username), '') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('profile-username:' || NEW.username, 0));
    IF lower(btrim(NEW.username)) = 'anonymous'
       OR (public.check_unified_slug_available(NEW.username, 'profile', NEW.id)->>'available')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'profile_username_taken' USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
  END IF;

  LOOP
    candidate := 'dalat-' || left(md5(NEW.id::text || ':' || attempt::text), 12);
    PERFORM pg_advisory_xact_lock(hashtextextended('profile-username:' || candidate, 0));
    IF (public.check_unified_slug_available(candidate, 'profile', NEW.id)->>'available')::boolean
       AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate AND id <> NEW.id) THEN
      NEW.username := candidate;
      RETURN NEW;
    END IF;
    attempt := attempt + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_profile_username() FROM PUBLIC, anon, authenticated;

-- Claim the route atomically, including against concurrent changes to other
-- entity types. A previously used route is still a redirect for its owner.
CREATE OR REPLACE FUNCTION public.sync_profile_to_unified_slugs()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.unified_slugs WHERE entity_type = 'profile' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.username IS NOT DISTINCT FROM NEW.username THEN
      RETURN NEW;
    END IF;
    UPDATE public.unified_slugs SET is_primary = false
    WHERE entity_type = 'profile' AND entity_id = OLD.id AND slug = lower(OLD.username);
  END IF;

  IF NEW.username IS NOT NULL THEN
    INSERT INTO public.unified_slugs AS existing (slug, entity_type, entity_id, is_primary)
    VALUES (lower(NEW.username), 'profile', NEW.id, true)
    ON CONFLICT (slug) DO UPDATE SET is_primary = true
    WHERE existing.entity_type = 'profile' AND existing.entity_id = NEW.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'profile_username_taken' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_profile_username
BEFORE INSERT OR UPDATE OF username ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_profile_username();

UPDATE public.profiles SET username = NULL WHERE nullif(btrim(username), '') IS NULL;
INSERT INTO public.profiles (id)
SELECT id FROM auth.users a WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = a.id)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;

CREATE SCHEMA IF NOT EXISTS event_identity;
REVOKE ALL ON SCHEMA event_identity FROM PUBLIC;

-- Called under the existing RSVP/event write permissions. No new public RPC.
CREATE FUNCTION event_identity.require_profile()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND lower(regexp_replace(display_name, '^[[:space:]]+|[[:space:]]+$', '', 'g')) NOT IN ('', 'anonymous')
         AND username <> 'anonymous'
     ) THEN
    RAISE EXCEPTION 'event_profile_required' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE FUNCTION event_identity.guard_participation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'rsvps' THEN
    IF NEW.user_id = auth.uid() AND NEW.status IN ('going', 'waitlist', 'interested') THEN
      PERFORM event_identity.require_profile();
    END IF;
  ELSIF TG_TABLE_NAME = 'series_rsvps' THEN
    IF NEW.user_id = auth.uid() AND NEW.auto_rsvp THEN
      PERFORM event_identity.require_profile();
    END IF;
  ELSIF NEW.created_by = auth.uid() THEN
    IF TG_TABLE_NAME = 'event_series' THEN
      PERFORM event_identity.require_profile();
    ELSIF TG_OP = 'INSERT' OR (NEW.status = 'published' AND OLD.status IS DISTINCT FROM NEW.status) THEN
      PERFORM event_identity.require_profile();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION event_identity.require_profile(), event_identity.guard_participation()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER require_rsvp_profile
BEFORE INSERT OR UPDATE OF status, plus_ones, user_id ON public.rsvps
FOR EACH ROW EXECUTE FUNCTION event_identity.guard_participation();

CREATE TRIGGER require_series_rsvp_profile
BEFORE INSERT OR UPDATE OF auto_rsvp, user_id ON public.series_rsvps
FOR EACH ROW EXECUTE FUNCTION event_identity.guard_participation();

CREATE TRIGGER require_event_creator_profile
BEFORE INSERT OR UPDATE OF status ON public.events
FOR EACH ROW EXECUTE FUNCTION event_identity.guard_participation();

CREATE TRIGGER require_series_creator_profile
BEFORE INSERT ON public.event_series
FOR EACH ROW EXECUTE FUNCTION event_identity.guard_participation();

-- Check before any event intent, including those that defer the actual RSVP
-- for a questionnaire or arrival setup. Its token stays usable until saved.
CREATE OR REPLACE FUNCTION public.complete_signup_intent(p_id uuid,p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i signup_intents%ROWTYPE; t tribes%ROWTYPE; v_result jsonb; joined jsonb; rsvp jsonb; user_created timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM signup_intents WHERE id=p_id AND token_hash=p_token_hash FOR UPDATE;
 IF NOT FOUND OR i.expires_at<=now() OR (i.completed_by IS NOT NULL AND i.completed_by<>auth.uid()) THEN RAISE EXCEPTION 'Invalid continuation' USING ERRCODE='42501'; END IF;
 IF i.result IS NOT NULL THEN RETURN i.result; END IF;
 v_result:=jsonb_build_object('next_path',i.next_path);
 IF i.community_id IS NOT NULL THEN SELECT * INTO t FROM tribes WHERE id=i.community_id; END IF;
 IF i.kind='event' THEN
  BEGIN
   PERFORM event_identity.require_profile();
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'event_profile_required' THEN RAISE; END IF;
   RAISE EXCEPTION 'event_profile_required' USING DETAIL = i.locale;
  END;
  v_result:=v_result||jsonb_build_object('locale',i.locale);
  IF i.event_action='interested' THEN
   rsvp:=mark_interested(i.target_id);
   v_result:=v_result||jsonb_build_object('rsvp_status','interested');
  ELSIF EXISTS(SELECT 1 FROM events e WHERE e.id=i.target_id AND e.arrival_enabled) OR EXISTS(SELECT 1 FROM event_questionnaires q JOIN event_questions eq ON eq.questionnaire_id=q.id WHERE q.event_id=i.target_id AND q.is_enabled) THEN
   v_result:=v_result||jsonb_build_object('rsvp_pending',true);
  ELSE
   rsvp:=rsvp_event(i.target_id,0);
   v_result:=v_result||jsonb_build_object('rsvp_status',rsvp->>'status');
  END IF;
 END IF;
 IF i.join_community AND t.id IS NOT NULL THEN
  BEGIN
   joined:=join_community(t.slug,i.invite_code,NULL);
   v_result:=v_result||jsonb_build_object('community_status',joined->>'status');
  EXCEPTION WHEN OTHERS THEN
   -- Account creation and RSVP remain valid when a community became unavailable.
   v_result:=v_result||jsonb_build_object('community_status','failed');
  END;
 END IF;
 SELECT created_at INTO user_created FROM auth.users WHERE id=auth.uid();
 IF user_created>=i.created_at AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_ghost) THEN
  BEGIN
  INSERT INTO account_acquisitions(user_id,source_kind,source_id,community_id,inviter_id,owner_at_signup,captured_at)
   VALUES(auth.uid(),i.kind,i.target_id,t.id,CASE WHEN i.inviter_id<>auth.uid() THEN i.inviter_id END,t.created_by,i.created_at)
   ON CONFLICT(user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'Account acquisition recording failed: %', SQLSTATE;
  END;
 END IF;
 IF i.visit_id IS NOT NULL AND t.id IS NOT NULL AND joined->>'status'='joined' THEN PERFORM complete_community_visit(i.visit_id,t.id); END IF;
 UPDATE signup_intents SET completed_by=auth.uid(),result=v_result,invite_code=NULL WHERE id=i.id;
 RETURN v_result||jsonb_build_object('just_completed',true,'event_id',CASE WHEN i.kind='event' THEN i.target_id END);
END $$;

CREATE OR REPLACE FUNCTION public.subscribe_to_series(
  p_series_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  -- Insert series subscription
  INSERT INTO series_rsvps (series_id, user_id, auto_rsvp)
  VALUES (p_series_id, p_user_id, true)
  ON CONFLICT (series_id, user_id)
  DO UPDATE SET auto_rsvp = true;

  -- Also RSVP to all existing future instances
  INSERT INTO rsvps (event_id, user_id, status, plus_ones)
  SELECT e.id, p_user_id, 'going', 0
  FROM events e
  WHERE e.series_id = p_series_id
    AND e.status = 'published'
    AND e.starts_at > now()
  ON CONFLICT (event_id, user_id) DO NOTHING;
END;
$$;

COMMIT;
