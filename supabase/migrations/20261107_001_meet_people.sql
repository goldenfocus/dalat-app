-- Meet People: opt-in community discovery using existing Dalat identities.
-- This migration deliberately contains no dating preferences or messaging.
BEGIN;

-- Reserve the route without silently taking somebody's existing handle.
LOCK TABLE public.profiles, public.venues, public.organizers, public.tribes,
  public.unified_slugs, public.reserved_slugs IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.unified_slugs WHERE lower(slug) = 'people')
    OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = 'people')
    OR EXISTS (SELECT 1 FROM public.venues WHERE lower(slug) = 'people')
    OR EXISTS (SELECT 1 FROM public.organizers WHERE lower(slug) = 'people')
    OR EXISTS (SELECT 1 FROM public.tribes WHERE lower(short_slug) = 'people') THEN
    RAISE EXCEPTION 'Meet People route /people conflicts with an existing handle; resolve with its owner before applying this migration';
  END IF;
END $$;
INSERT INTO public.reserved_slugs(slug, reason)
VALUES ('people', 'Route: /people') ON CONFLICT (slug) DO NOTHING;

-- A small data catalog validates stable translation keys. Adding another
-- option is a catalog insert plus translated UI copy, not an ALTER TABLE.
CREATE TABLE public.people_options (
  kind text NOT NULL CHECK (kind IN ('intention', 'interest', 'language')),
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  PRIMARY KEY (kind, key)
);
ALTER TABLE public.people_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.people_options FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.people_options TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_options TO service_role;
CREATE POLICY people_options_read ON public.people_options FOR SELECT USING (true);
INSERT INTO public.people_options(kind, key)
SELECT 'intention', unnest(ARRAY['friendship','business','projects','creative','activities','community','language_exchange','events','families'])
UNION ALL
SELECT 'interest', unnest(ARRAY['coffee','hiking','music','art','food','technology','wellness','sports','photography','gardening','books','travel'])
UNION ALL
SELECT 'language', unnest(ARRAY['en','vi','ko','zh','ru','fr','ja','ms','th','de','es','id']);

CREATE TABLE public.people_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  intentions text[] NOT NULL DEFAULT '{}',
  interests text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  help_offered text NOT NULL DEFAULT '' CHECK (char_length(help_offered) <= 500),
  help_wanted text NOT NULL DEFAULT '' CHECK (char_length(help_wanted) <= 500),
  source_locale text CHECK (source_locale IS NULL OR source_locale IN ('en','vi','ko','zh','ru','fr','ja','ms','th','de','es','id')),
  content_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX people_profiles_enabled ON public.people_profiles(updated_at DESC, user_id) WHERE enabled;
CREATE INDEX people_profiles_intentions ON public.people_profiles USING gin(intentions) WHERE enabled;
CREATE INDEX people_profiles_interests ON public.people_profiles USING gin(interests) WHERE enabled;
CREATE INDEX people_profiles_languages ON public.people_profiles USING gin(languages) WHERE enabled;
ALTER TABLE public.people_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.people_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_profiles TO service_role;

CREATE TABLE public.people_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX people_blocks_reverse ON public.people_blocks(blocked_id, blocker_id);
ALTER TABLE public.people_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.people_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.people_blocks TO authenticated;
GRANT INSERT (blocker_id, blocked_id) ON public.people_blocks TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.people_blocks TO service_role;

-- The caller can ask only about their own relationship to a target; no API
-- accepts a viewer ID that could impersonate another member or inspect pairs.
CREATE FUNCTION public.people_blocked(p_target_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.people_blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p_target_user_id)
       OR (b.blocked_id = auth.uid() AND b.blocker_id = p_target_user_id)
  );
$$;
-- Hosted Supabase grants these roles EXECUTE by default. Clear both PUBLIC
-- and explicit role grants before granting only the intended RPC access.
REVOKE ALL ON FUNCTION public.people_blocked(uuid) FROM PUBLIC, anon, authenticated, service_role;
-- Internal only: an authenticated RPC must not reveal reverse-block status.

CREATE FUNCTION public.people_is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin','admin','moderator'));
$$;
REVOKE ALL ON FUNCTION public.people_is_staff() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.people_is_staff() TO authenticated, service_role;

-- SECURITY DEFINER avoids recursive people_profiles RLS. Anonymous callers
-- always get false; the translation policy can safely use it without giving
-- anonymous callers SELECT permission on people_profiles itself.
CREATE FUNCTION public.can_view_people_profile(p_target_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.people_profiles pp JOIN public.profiles p ON p.id = pp.user_id
    WHERE pp.user_id = p_target_user_id AND (
      pp.user_id = auth.uid()
      OR (pp.enabled AND NOT p.is_private AND NOT COALESCE(p.is_ghost, false)
        AND NOT public.people_blocked(pp.user_id))
    )
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_people_profile(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_people_profile(uuid) TO anon, authenticated, service_role;

CREATE POLICY people_profiles_read ON public.people_profiles FOR SELECT TO authenticated
  -- INSERT ... RETURNING and upsert SELECT checks run before a definer helper
  -- can find the newly inserted row. Owner visibility must be row-local.
  USING (user_id = auth.uid() OR public.can_view_people_profile(user_id));
CREATE POLICY people_profiles_insert_own ON public.people_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY people_profiles_update_own ON public.people_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY people_profiles_delete_own ON public.people_profiles FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY people_blocks_read_own ON public.people_blocks FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());
CREATE POLICY people_blocks_insert_own ON public.people_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid() AND (
    public.can_view_people_profile(blocked_id)
    OR EXISTS (SELECT 1 FROM public.people_blocks b
      WHERE b.blocker_id = auth.uid() AND b.blocked_id = people_blocks.blocked_id)
  ));
CREATE POLICY people_blocks_delete_own ON public.people_blocks FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

CREATE TABLE public.people_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('harassment','spam','impersonation','other')),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_user_id)
);
CREATE INDEX people_reports_open ON public.people_reports(created_at DESC) WHERE status = 'open';
CREATE INDEX people_reports_reporter ON public.people_reports(reporter_id, created_at DESC);
CREATE UNIQUE INDEX people_reports_one_open ON public.people_reports(reporter_id, reported_user_id) WHERE status = 'open';
ALTER TABLE public.people_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.people_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.people_reports TO authenticated;
GRANT INSERT (reporter_id, reported_user_id, reason, details) ON public.people_reports TO authenticated;
GRANT UPDATE (status) ON public.people_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_reports TO service_role;
CREATE POLICY people_reports_read ON public.people_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.people_is_staff());
CREATE POLICY people_reports_insert ON public.people_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND (
    public.can_view_people_profile(reported_user_id)
    OR EXISTS (SELECT 1 FROM public.people_blocks b WHERE b.blocker_id = auth.uid() AND b.blocked_id = reported_user_id)
  ));
CREATE POLICY people_reports_review ON public.people_reports FOR UPDATE TO authenticated
  USING (public.people_is_staff()) WITH CHECK (public.people_is_staff());

CREATE TABLE public.event_people (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_people_user ON public.event_people(user_id, event_id);
ALTER TABLE public.event_people ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_people FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.event_people TO authenticated;
GRANT INSERT (event_id, user_id) ON public.event_people TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.event_people TO service_role;
CREATE POLICY event_people_read ON public.event_people FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (
    public.can_view_people_profile(user_id)
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_people.event_id)
    AND EXISTS (SELECT 1 FROM public.rsvps r WHERE r.event_id = event_people.event_id
      AND r.user_id = event_people.user_id AND r.status = 'going')
  ));
CREATE POLICY event_people_insert_own ON public.event_people FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.people_profiles pp JOIN public.profiles p ON p.id = pp.user_id
      WHERE pp.user_id = auth.uid() AND pp.enabled AND NOT p.is_private AND NOT COALESCE(p.is_ghost, false))
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_people.event_id)
    AND EXISTS (SELECT 1 FROM public.rsvps r WHERE r.event_id = event_people.event_id
      AND r.user_id = auth.uid() AND r.status = 'going'));
CREATE POLICY event_people_delete_own ON public.event_people FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Parameterized, literal text search. This remains SECURITY INVOKER so every
-- profile/event membership returned is subject to the caller's RLS policies.
CREATE FUNCTION public.discover_people(
  p_search text DEFAULT '', p_intention text DEFAULT NULL,
  p_language text DEFAULT NULL, p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 24, p_event_id uuid DEFAULT NULL
) RETURNS SETOF public.people_profiles
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH search AS (
    SELECT '%' || replace(replace(replace(left(btrim(COALESCE(p_search, '')), 100),
      E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' AS pattern
  )
  SELECT pp.* FROM public.people_profiles pp
  JOIN public.profiles p ON p.id = pp.user_id
  CROSS JOIN search s
  WHERE pp.enabled AND NOT p.is_private AND NOT COALESCE(p.is_ghost, false)
    AND (p_intention IS NULL OR p_intention = ANY(pp.intentions))
    AND (p_language IS NULL OR p_language = ANY(pp.languages))
    AND (p.display_name ILIKE s.pattern ESCAPE E'\\'
      OR p.username ILIKE s.pattern ESCAPE E'\\'
      OR pp.help_offered ILIKE s.pattern ESCAPE E'\\'
      OR pp.help_wanted ILIKE s.pattern ESCAPE E'\\')
    AND (p_event_id IS NULL OR EXISTS (
      SELECT 1 FROM public.event_people ep JOIN public.rsvps r
        ON r.event_id = ep.event_id AND r.user_id = ep.user_id
      WHERE ep.event_id = p_event_id AND ep.user_id = pp.user_id AND r.status = 'going'
        AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = ep.event_id)
    ))
  ORDER BY pp.user_id
  OFFSET least(greatest(COALESCE(p_offset, 0), 0), 10000)
  LIMIT least(greatest(COALESCE(p_limit, 24), 1), 25);
$$;
REVOKE ALL ON FUNCTION public.discover_people(text,text,text,integer,integer,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.discover_people(text,text,text,integer,integer,uuid) TO authenticated;

-- Preserve every existing type and field while adding protected People copy.
ALTER TABLE public.content_translations DROP CONSTRAINT content_translations_content_type_check;
ALTER TABLE public.content_translations ADD CONSTRAINT content_translations_content_type_check
  CHECK (content_type IN ('event','moment','profile','blog','venue','comment','organizer','track','people'));
ALTER TABLE public.content_translations DROP CONSTRAINT content_translations_field_name_check;
ALTER TABLE public.content_translations ADD CONSTRAINT content_translations_field_name_check CHECK (field_name IN (
  'title','description','text_content','bio','story_content','technical_content','meta_description',
  'image_alt','image_description','ai_description','ai_title','scene_description','video_summary','audio_summary','pdf_summary',
  'video_transcript','audio_transcript','pdf_extracted_text','content','lyrics','help_offered','help_wanted'
));
ALTER TABLE public.content_translations ADD COLUMN source_updated_at timestamptz;
COMMENT ON COLUMN public.content_translations.source_updated_at IS
  'For People translations, exact people_profiles.content_updated_at revision translated; enforced against stale worker writes.';
DROP POLICY translations_select_public ON public.content_translations;
CREATE POLICY translations_select_public ON public.content_translations FOR SELECT USING (
  CASE
    WHEN content_type = 'people' THEN public.can_view_people_profile(content_id)
    WHEN content_type = 'profile' THEN content_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = content_id AND NOT p.is_private)
    ELSE true
  END
);
CREATE POLICY people_translations_delete_own ON public.content_translations FOR DELETE TO authenticated
  USING (content_type = 'people' AND content_id = auth.uid());

-- Bound and validate catalog arrays, protect server timestamps, and invalidate
-- source changes in the same transaction even when a client callback is lost.
CREATE FUNCTION public.prepare_people_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE item record; v_now timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'People profile identity cannot change' USING ERRCODE = '42501';
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('intention'::text, NEW.intentions), ('interest'::text, NEW.interests), ('language'::text, NEW.languages)
  ) AS options(kind, keys) LOOP
    IF item.keys IS NULL OR cardinality(item.keys) > 24
      OR (cardinality(item.keys) > 0 AND array_ndims(item.keys) <> 1)
      OR EXISTS (SELECT 1 FROM unnest(item.keys) k WHERE k IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.people_options o WHERE o.kind = item.kind AND o.key = k))
      OR cardinality(item.keys) <> (SELECT count(DISTINCT k) FROM unnest(item.keys) k) THEN
      RAISE EXCEPTION 'Invalid People % options', item.kind USING ERRCODE = '23514';
    END IF;
  END LOOP;
  NEW.help_offered := btrim(NEW.help_offered);
  NEW.help_wanted := btrim(NEW.help_wanted);
  NEW.updated_at := v_now;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := v_now;
    NEW.content_updated_at := v_now;
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.content_updated_at := OLD.content_updated_at;
    IF NEW.help_offered IS DISTINCT FROM OLD.help_offered
      OR NEW.help_wanted IS DISTINCT FROM OLD.help_wanted
      OR NEW.source_locale IS DISTINCT FROM OLD.source_locale THEN
      -- Strictly advance even if clock resolution or clock adjustment would
      -- otherwise repeat an earlier source revision.
      NEW.content_updated_at := greatest(v_now, OLD.content_updated_at + interval '1 microsecond');
      DELETE FROM public.content_translations WHERE content_type = 'people' AND content_id = OLD.user_id;
    END IF;
    IF OLD.enabled AND NOT NEW.enabled THEN
      DELETE FROM public.event_people WHERE user_id = OLD.user_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prepare_people_profile() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER prepare_people_profile BEFORE INSERT OR UPDATE ON public.people_profiles
  FOR EACH ROW EXECUTE FUNCTION public.prepare_people_profile();

CREATE FUNCTION public.delete_people_translations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM public.content_translations WHERE content_type = 'people' AND content_id = OLD.user_id;
  DELETE FROM public.event_people WHERE user_id = OLD.user_id;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.delete_people_translations() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER delete_people_translations AFTER DELETE ON public.people_profiles
  FOR EACH ROW EXECUTE FUNCTION public.delete_people_translations();

-- Leaving attendance or withdrawing profile visibility revokes event-specific
-- introduction consent. Rejoining later never silently restores that consent.
CREATE FUNCTION public.revoke_event_people_on_rsvp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.status IS DISTINCT FROM 'going' THEN
    DELETE FROM public.event_people WHERE event_id = OLD.event_id AND user_id = OLD.user_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.revoke_event_people_on_rsvp() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER revoke_event_people_on_rsvp AFTER UPDATE OF status OR DELETE ON public.rsvps
  FOR EACH ROW EXECUTE FUNCTION public.revoke_event_people_on_rsvp();

CREATE FUNCTION public.revoke_event_people_on_privacy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.is_private OR COALESCE(NEW.is_ghost, false) THEN
    DELETE FROM public.event_people WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.revoke_event_people_on_privacy() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER revoke_event_people_on_privacy AFTER UPDATE OF is_private, is_ghost ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.revoke_event_people_on_privacy();

CREATE FUNCTION public.guard_people_translation_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE source_row public.people_profiles%ROWTYPE; source_text text;
BEGIN
  -- Reclassifying an existing People row would evade its read policy.
  IF TG_OP = 'UPDATE' AND OLD.content_type = 'people'
    AND (NEW.content_type <> OLD.content_type OR NEW.content_id <> OLD.content_id) THEN
    RAISE EXCEPTION 'People translation identity cannot change' USING ERRCODE = '42501';
  END IF;
  IF NEW.content_type <> 'people' THEN RETURN NEW; END IF;
  IF NEW.field_name NOT IN ('help_offered','help_wanted') THEN
    RAISE EXCEPTION 'Invalid People translation field' USING ERRCODE = '23514';
  END IF;
  -- Serialize with source edits. A worker completing after an edit receives
  -- a stale-revision error instead of restoring deleted sensitive text.
  SELECT * INTO source_row FROM public.people_profiles WHERE user_id = NEW.content_id FOR SHARE;
  IF NOT FOUND OR NEW.source_updated_at IS DISTINCT FROM source_row.content_updated_at THEN
    RAISE EXCEPTION 'Stale People translation source revision' USING ERRCODE = '40001';
  END IF;
  source_text := CASE NEW.field_name WHEN 'help_offered' THEN source_row.help_offered ELSE source_row.help_wanted END;
  IF source_text = '' THEN
    RAISE EXCEPTION 'People translation source is empty' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_people_translation_revision() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_people_translation_revision BEFORE INSERT OR UPDATE ON public.content_translations
  FOR EACH ROW EXECUTE FUNCTION public.guard_people_translation_revision();

COMMENT ON TABLE public.people_profiles IS 'Opt-in community discovery. Never store dating preferences or private contact details here.';
COMMENT ON TABLE public.people_blocks IS 'Bilateral exclusion within Meet People; does not promise to hide existing public event attendance or public profiles.';
COMMENT ON TABLE public.event_people IS 'Explicit People introduction participation for an event; separate from existing public RSVP visibility.';

COMMIT;
