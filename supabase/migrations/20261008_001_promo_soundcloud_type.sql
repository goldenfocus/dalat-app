-- Allow SoundCloud embeds as promo media (media_url = track permalink, thumbnail_url = artwork)
ALTER TABLE promo_media DROP CONSTRAINT promo_media_media_type_check;
ALTER TABLE promo_media ADD CONSTRAINT promo_media_media_type_check
  CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'youtube'::text, 'pdf'::text, 'soundcloud'::text]));
