-- Visual repairs run before this constraint is validated. Reject legacy
-- generated templates at the storage boundary, including writes by old code.
ALTER TABLE public.events ADD CONSTRAINT events_no_activity_template_cover
  CHECK (image_url IS NULL OR image_url !~* '/activity-art/') NOT VALID;
ALTER TABLE public.event_series ADD CONSTRAINT series_no_activity_template_cover
  CHECK (image_url IS NULL OR image_url !~* '/activity-art/') NOT VALID;
ALTER TABLE public.events VALIDATE CONSTRAINT events_no_activity_template_cover;
ALTER TABLE public.event_series VALIDATE CONSTRAINT series_no_activity_template_cover;
