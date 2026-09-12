BEGIN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.private_profile_details (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 bio text
);
ALTER TABLE public.private_profile_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_profile_details FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.private_profile_details TO authenticated;
GRANT ALL ON public.private_profile_details TO service_role;
CREATE POLICY private_profile_details_read_own ON public.private_profile_details FOR SELECT TO authenticated USING(user_id=auth.uid());
-- Names/avatars remain on public RSVP rows; private biographies never do.
CREATE OR REPLACE FUNCTION public.protect_private_profile_bio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.is_private THEN
  DELETE FROM content_translations WHERE content_type='profile' AND content_id=NEW.id;
  -- Re-saving the privacy flag must not erase the separately stored biography.
  -- An explicit empty string clears a private biography.
  IF NOT OLD.is_private OR NEW.bio IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private_profile_details WHERE user_id=NEW.id) THEN
  INSERT INTO private_profile_details(user_id,bio) VALUES(NEW.id,NULLIF(NEW.bio,''))
  ON CONFLICT(user_id) DO UPDATE SET bio=EXCLUDED.bio;
  END IF;
  NEW.bio:=NULL;
 ELSIF OLD.is_private THEN
  SELECT bio INTO NEW.bio FROM private_profile_details WHERE user_id=NEW.id;
  DELETE FROM private_profile_details WHERE user_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_private_profile_bio BEFORE UPDATE OF bio,is_private ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_private_profile_bio();
CREATE OR REPLACE FUNCTION public.initialize_profile_privacy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.is_private THEN UPDATE profiles SET bio=NEW.bio WHERE id=NEW.id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER initialize_profile_privacy AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.initialize_profile_privacy();
DROP POLICY IF EXISTS translations_select_public ON public.content_translations;
CREATE POLICY translations_select_public ON public.content_translations FOR SELECT USING (
 content_type<>'profile' OR content_id=auth.uid() OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=content_id AND NOT p.is_private)
);
COMMENT ON COLUMN public.profiles.is_private IS 'Hides profile page and biography. Name, avatar and participation in public events remain public.';
COMMIT;
