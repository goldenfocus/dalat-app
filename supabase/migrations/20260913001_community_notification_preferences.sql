CREATE TABLE IF NOT EXISTS public.community_notification_preferences (
  tribe_id uuid NOT NULL,
  user_id uuid NOT NULL,
  muted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tribe_id, user_id),
  FOREIGN KEY (tribe_id, user_id) REFERENCES public.tribe_members(tribe_id, user_id) ON DELETE CASCADE
);
ALTER TABLE public.community_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_community_preferences_read ON public.community_notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY own_community_preferences_insert ON public.community_notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_tribe_member(tribe_id));
CREATE POLICY own_community_preferences_update ON public.community_notification_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_tribe_member(tribe_id));
GRANT SELECT, INSERT, UPDATE ON public.community_notification_preferences TO authenticated;
GRANT ALL ON public.community_notification_preferences TO service_role;
