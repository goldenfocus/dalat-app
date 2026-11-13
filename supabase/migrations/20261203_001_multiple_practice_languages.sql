-- Extend the existing private profile contract without replacing old saved choices.
BEGIN;
CREATE OR REPLACE FUNCTION public.valid_event_language_preferences(p_preferences jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE item jsonb; seen text[]:=ARRAY[]::text[]; target_seen text[]:=ARRAY[]::text[];
 codes constant text[] := ARRAY['aa','ab','ae','af','ak','am','an','ar','as','av','ay','az','ba','be','bg','bh','bi','bm','bn','bo','br','bs','ca','ce','ch','co','cr','cs','cu','cv','cy','da','de','dv','dz','ee','el','en','eo','es','et','eu','fa','ff','fi','fj','fo','fr','fy','ga','gd','gl','gn','gu','gv','ha','he','hi','ho','hr','ht','hu','hy','hz','ia','id','ie','ig','ii','ik','io','is','it','iu','ja','jv','ka','kg','ki','kj','kk','kl','km','kn','ko','kr','ks','ku','kv','kw','ky','la','lb','lg','li','ln','lo','lt','lu','lv','mg','mh','mi','mk','ml','mn','mr','ms','mt','my','na','nb','nd','ne','ng','nl','nn','no','nr','nv','ny','oc','oj','om','or','os','pa','pi','pl','ps','pt','qu','rm','rn','ro','ru','rw','sa','sc','sd','se','sg','si','sk','sl','sm','sn','so','sq','sr','ss','st','su','sv','sw','ta','te','tg','th','ti','tk','tl','tn','to','tr','ts','tt','tw','ty','ug','uk','ur','uz','ve','vi','vo','wa','wo','xh','yi','yo','za','zh','zu'];
BEGIN
 IF p_preferences IS NULL OR jsonb_typeof(p_preferences) IS DISTINCT FROM 'object'
 OR NOT (p_preferences ?& ARRAY['speaks','learning'])
 OR (p_preferences-ARRAY['speaks','learning','additionalLearning'])<>'{}'::jsonb
 OR jsonb_typeof(p_preferences->'speaks') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_preferences->'learning') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF jsonb_array_length(p_preferences->'speaks') NOT BETWEEN 1 AND 8 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_preferences->'speaks') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['language','level'])
  OR (item-ARRAY['language','level'])<>'{}'::jsonb
  OR NOT coalesce((item->>'language')=ANY(codes),false)
  OR NOT coalesce((item->>'level')=ANY(ARRAY['native','fluent','intermediate','beginner','new']),false)
  OR (item->>'language')=ANY(seen) THEN RETURN false; END IF;
  seen:=array_append(seen,item->>'language');
 END LOOP;
 IF p_preferences ? 'additionalLearning' THEN
  IF jsonb_typeof(p_preferences->'additionalLearning') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_preferences->'additionalLearning')>7 THEN RETURN false; END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(jsonb_build_array(p_preferences->'learning') || coalesce(p_preferences->'additionalLearning','[]'::jsonb)) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['language','level'])
  OR (item-ARRAY['language','level'])<>'{}'::jsonb
  OR NOT coalesce((item->>'language')=ANY(codes),false)
  OR NOT coalesce((item->>'level')=ANY(ARRAY['fluent','intermediate','beginner','new']),false)
  OR (item->>'language')=ANY(target_seen) THEN RETURN false; END IF;
  target_seen:=array_append(target_seen,item->>'language');
 END LOOP;
 RETURN true;
END; $$;
-- A guest can fill a missing snapshot through the authenticated server endpoint.
-- Existing snapshots remain immutable, including when the account profile changes.
CREATE OR REPLACE FUNCTION public.snapshot_arrival_language_preferences()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  NEW.language_preferences:=coalesce(OLD.language_preferences,NEW.language_preferences);
 ELSIF NEW.user_id IS NOT NULL THEN
  SELECT preferences INTO NEW.language_preferences FROM public.event_language_profiles WHERE user_id=NEW.user_id;
 ELSE NEW.language_preferences:=NULL;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.snapshot_arrival_language_preferences() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
