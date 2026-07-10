-- Starter tribes for the /tribes discovery launch (Jul 2026).
-- Idempotent: skips slugs that already exist. Run via scripts/supabase-run-sql.sh
-- after replacing :OWNER with the owning profile id (resolved from profiles at run time).

INSERT INTO tribes (slug, name, description, access_type, is_listed, created_by)
SELECT v.slug, v.name, v.description, 'public', true, ':OWNER'::uuid
FROM (VALUES
  ('hiking-trails', 'Hiking & Trails', 'Pine forests, waterfall chases, sunrise summits. We walk, we wander, we regret nothing (except that last hill).'),
  ('coffee-crawl', 'Coffee Crawl', 'Đà Lạt runs on arabica. Weekly missions to find the city''s best cup — from hidden garden cafés to roasters who take it very seriously.'),
  ('pickleball-dalat', 'Pickleball Đà Lạt', 'The fastest-growing sport in the highlands. All levels, loaner paddles, zero judgment — just show up.'),
  ('digital-nomads', 'Digital Nomads Đà Lạt', 'Remote workers, laptop warriors, café campers. Coworking days, visa wisdom, and the eternal hunt for fast wifi and good light.'),
  ('photography-walks', 'Photography Walks', 'Golden hour over Xuân Hương, misty pine alleys, market portraits. Bring any camera — phones count.'),
  ('food-adventures', 'Food Adventures', 'Bánh căn at dawn, lẩu gà lá é at night. We eat our way through Đà Lạt one street stall at a time.'),
  ('sunrise-runners', 'Sunrise Runners', 'Easy pace around the lake before the city wakes up. Cool air, warm people, coffee after — always coffee after.'),
  ('board-games-chill', 'Board Games & Chill', 'Rainy season''s best answer. Strategy nights, party games, and friendly betrayal over hot cacao.')
) AS v(slug, name, description)
WHERE NOT EXISTS (SELECT 1 FROM tribes t WHERE t.slug = v.slug);

-- The tribes UI expects the creator to be a leader member (the create API does this).
INSERT INTO tribe_members (tribe_id, user_id, role, status)
SELECT t.id, t.created_by, 'leader', 'active'
FROM tribes t
WHERE t.created_by = ':OWNER'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM tribe_members m WHERE m.tribe_id = t.id AND m.user_id = t.created_by
  );
