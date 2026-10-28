-- Private event practice: identities remain in the authenticated/receipt API.
CREATE TABLE IF NOT EXISTS public.event_practice_rooms (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{"rounds":[]}'::jsonb,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_practice_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_practice_rooms FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_practice_rooms TO service_role;
