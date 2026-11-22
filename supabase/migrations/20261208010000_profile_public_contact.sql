-- Public contact channels for realtor/landlord profiles, shown on rental listings.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS zalo text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS telegram text,
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.profiles.zalo IS 'Zalo phone number or zalo.me URL, shown on rental listings';
COMMENT ON COLUMN public.profiles.whatsapp IS 'WhatsApp number (E.164) or wa.me URL, shown on rental listings';
COMMENT ON COLUMN public.profiles.telegram IS 'Telegram @username or t.me URL, shown on rental listings';
COMMENT ON COLUMN public.profiles.phone IS 'Voice phone number for tel: links, shown on rental listings';
