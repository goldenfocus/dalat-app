alter table public.venues
  add column if not exists tiktok_url text;

comment on column public.venues.tiktok_url is
  'Official venue TikTok profile or post URL.';
