-- Language preferences belong to the signed-in guest. Never publish or translate
-- this private profile through the public content/translation registry.
CREATE OR REPLACE FUNCTION public.valid_event_language_preferences(p_preferences jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  item jsonb;
  seen text[] := ARRAY[]::text[];
  codes constant text[] := ARRAY['aa','ab','ae','af','ak','am','an','ar','as','av','ay','az','ba','be','bg','bh','bi','bm','bn','bo','br','bs','ca','ce','ch','co','cr','cs','cu','cv','cy','da','de','dv','dz','ee','el','en','eo','es','et','eu','fa','ff','fi','fj','fo','fr','fy','ga','gd','gl','gn','gu','gv','ha','he','hi','ho','hr','ht','hu','hy','hz','ia','id','ie','ig','ii','ik','io','is','it','iu','ja','jv','ka','kg','ki','kj','kk','kl','km','kn','ko','kr','ks','ku','kv','kw','ky','la','lb','lg','li','ln','lo','lt','lu','lv','mg','mh','mi','mk','ml','mn','mr','ms','mt','my','na','nb','nd','ne','ng','nl','nn','no','nr','nv','ny','oc','oj','om','or','os','pa','pi','pl','ps','pt','qu','rm','rn','ro','ru','rw','sa','sc','sd','se','sg','si','sk','sl','sm','sn','so','sq','sr','ss','st','su','sv','sw','ta','te','tg','th','ti','tk','tl','tn','to','tr','ts','tt','tw','ty','ug','uk','ur','uz','ve','vi','vo','wa','wo','xh','yi','yo','za','zh','zu'];
BEGIN
  IF p_preferences IS NULL OR jsonb_typeof(p_preferences) <> 'object'
    OR NOT (p_preferences ?& ARRAY['speaks','learning'])
    OR (p_preferences - ARRAY['speaks','learning']) <> '{}'::jsonb
    OR jsonb_typeof(p_preferences->'speaks') <> 'array'
    OR jsonb_typeof(p_preferences->'learning') <> 'object' THEN RETURN false; END IF;
  IF jsonb_array_length(p_preferences->'speaks') NOT BETWEEN 1 AND 8 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_preferences->'speaks') LOOP
    IF jsonb_typeof(item) <> 'object' OR NOT (item ?& ARRAY['language','level'])
      OR (item - ARRAY['language','level']) <> '{}'::jsonb
      OR jsonb_typeof(item->'language') <> 'string' OR jsonb_typeof(item->'level') <> 'string'
      OR NOT ((item->>'language') = ANY(codes))
      OR NOT ((item->>'level') = ANY(ARRAY['native','fluent','intermediate','beginner','new']))
      OR (item->>'language') = ANY(seen) THEN RETURN false; END IF;
    seen := array_append(seen,item->>'language');
  END LOOP;
  item := p_preferences->'learning';
  RETURN item ?& ARRAY['language','level']
    AND (item - ARRAY['language','level']) = '{}'::jsonb
    AND jsonb_typeof(item->'language') = 'string' AND jsonb_typeof(item->'level') = 'string'
    AND (item->>'language') = ANY(codes)
    AND (item->>'level') = ANY(ARRAY['fluent','intermediate','beginner','new']);
END;
$$;

CREATE TABLE IF NOT EXISTS public.event_language_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL CHECK (public.valid_event_language_preferences(preferences)),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_language_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_language_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.event_language_profiles TO authenticated;
GRANT ALL ON public.event_language_profiles TO service_role;
CREATE POLICY event_language_profiles_self_select ON public.event_language_profiles
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY event_language_profiles_self_insert ON public.event_language_profiles
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY event_language_profiles_self_update ON public.event_language_profiles
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.touch_event_language_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
CREATE TRIGGER event_language_profiles_touch BEFORE UPDATE ON public.event_language_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_event_language_profile();
COMMENT ON TABLE public.event_language_profiles IS 'Private reusable language preferences; only the account owner can read or write through the Data API.';
REVOKE ALL ON FUNCTION public.touch_event_language_profile() FROM PUBLIC, anon, authenticated, service_role;

-- Freeze the language choices used for this particular meeting. Later profile
-- edits are for future meetings and never rewrite past arrivals.
ALTER TABLE public.event_arrival_participants ADD COLUMN language_preferences jsonb
  CHECK (language_preferences IS NULL OR public.valid_event_language_preferences(language_preferences));
CREATE OR REPLACE FUNCTION public.snapshot_arrival_language_preferences()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.language_preferences := OLD.language_preferences;
  ELSE
    NEW.language_preferences := NULL;
    IF NEW.user_id IS NOT NULL THEN
      SELECT preferences INTO NEW.language_preferences FROM public.event_language_profiles WHERE user_id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_arrival_language_preferences() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER arrival_language_snapshot BEFORE INSERT OR UPDATE ON public.event_arrival_participants
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_arrival_language_preferences();
