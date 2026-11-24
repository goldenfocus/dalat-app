ALTER TABLE public.events ADD COLUMN IF NOT EXISTS contact_link_images jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contact_link_images) = 'object');
ALTER TABLE public.event_series ADD COLUMN IF NOT EXISTS contact_link_images jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contact_link_images) = 'object');
NOTIFY pgrst, 'reload schema';
