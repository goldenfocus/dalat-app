-- Prevent future creator/venue slugs from colliding with the additive experience routes.
insert into public.reserved_slugs(slug,reason) values
 ('experiences','Firsthand experience journal'),
 ('experience-media','Experience photo delivery')
on conflict(slug) do nothing;
