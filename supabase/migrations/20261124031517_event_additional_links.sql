-- Keep the legacy primary link intact; additional public links are ordered.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS additional_links jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.event_series ADD COLUMN IF NOT EXISTS additional_links jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.events ADD CONSTRAINT events_additional_links_array CHECK (
 jsonb_typeof(additional_links) = 'array' AND jsonb_array_length(additional_links) < 20
 AND NOT jsonb_path_exists(additional_links, '$[*] ? (@.type() != "string")')
);
ALTER TABLE public.event_series ADD CONSTRAINT event_series_additional_links_array CHECK (
 jsonb_typeof(additional_links) = 'array' AND jsonb_array_length(additional_links) < 20
 AND NOT jsonb_path_exists(additional_links, '$[*] ? (@.type() != "string")')
);
NOTIFY pgrst, 'reload schema';

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS contact_link_names jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contact_link_names) = 'object');
ALTER TABLE public.event_series ADD COLUMN IF NOT EXISTS contact_link_names jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contact_link_names) = 'object');
COMMENT ON COLUMN public.events.contact_link_names IS 'Organizer-supplied community/link proper names keyed by normalized URL; preserve original names.';
COMMENT ON COLUMN public.event_series.contact_link_names IS 'Organizer-supplied community/link proper names keyed by normalized URL; preserve original names.';
NOTIFY pgrst, 'reload schema';
