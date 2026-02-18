-- ============================================
-- Add new venue types: hiking, vegetarian, vegan
-- Seed top 3 venues per category (36 venues)
-- Create "venues" blog category + venue guide blog posts
-- ============================================

-- 1. Expand venue_type CHECK constraint to include new types
ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_venue_type_check;
ALTER TABLE venues ADD CONSTRAINT venues_venue_type_check CHECK (venue_type IN (
  'cafe', 'bar', 'restaurant', 'gallery', 'park', 'hotel',
  'coworking', 'community_center', 'outdoor', 'homestay',
  'hiking', 'vegetarian', 'vegan', 'other'
));

-- 2. Seed venues for all 12 discovery categories
-- Using ON CONFLICT to avoid duplicates if re-run

-- ===== CAFES =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('la-viet-coffee', 'La Viet Coffee', 'Founded in 2015, La Viet Coffee is Da Lat''s premier specialty coffee destination. Known for innovative cold brew, espresso-based mocktails with local ingredients like mulberry juice, and a beautiful industrial-chic space that has become a landmark for coffee lovers visiting the highlands.', 'cafe', 11.9389, 108.4420, '200 Nguyen Cong Tru, Da Lat', '$$', ARRAY['specialty-coffee', 'cold-brew', 'instagram-worthy', 'industrial-design'], true, 90),
  ('kho-coffee', 'K''Ho Coffee', 'A unique specialty coffee shop on a smallholder arabica farm at the base of Langbiang Mountain. Founded in 2012 as a family business by the K''Ho ethnic minority, it offers ethically-produced highland arabica in a rustic setting with mountain views, ethnic textiles, and a charming wooden hut.', 'cafe', 12.0196, 108.4244, 'Bonneur''C Village, Langbiang, Lac Duong', '$$', ARRAY['ethnic-coffee', 'farm-to-cup', 'langbiang', 'cultural-experience'], true, 85),
  ('bicycle-up-cafe', 'Bicycle Up Cafe', 'Named for the antique bicycle perched atop a piano, this small character-packed cafe on Truong Cong Dinh Street caters to pure coffee lovers and retro enthusiasts. The vintage setting, impressive drink menu, and warm hospitality make it a favorite among specialty coffee aficionados.', 'cafe', 11.9403, 108.4383, '82 Truong Cong Dinh, Ward 1, Da Lat', '$$', ARRAY['vintage', 'retro', 'specialty-coffee', 'cozy'], true, 80)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;

-- ===== BARS =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('maze-bar-100-roofs', 'Maze Bar (100 Roofs Cafe)', 'A mystical labyrinth spread across five floors with twisting passageways, hidden rooms, and spiraling staircases. Entry is just the cost of a drink. The rooftop rewards the adventurous with panoramic night views of Da Lat. One of the most unique bar experiences in all of Vietnam.', 'bar', 11.9398, 108.4397, '57 Phan Boi Chau, Ward 1, Da Lat', '$$', ARRAY['unique-experience', 'rooftop', 'labyrinth', 'nightlife'], true, 90),
  ('the-fog-bar', 'The Fog On Site', 'Located on Truong Cong Dinh Street, this bar creates a captivating foggy ambiance that adds to its mysterious allure. Craft cocktails, fine wines, and spirits are served in enchanting surroundings. Open 5 PM to 2 AM daily, it''s the go-to spot for Da Lat''s cocktail culture.', 'bar', 11.9404, 108.4385, '76 Truong Cong Dinh, Da Lat', '$$', ARRAY['cocktails', 'atmosphere', 'nightlife', 'craft-drinks'], true, 85),
  ('b21-beer', 'B21 Beer', 'A local favorite on Da Lat''s "Western Street" attracting fun-loving crowds. Features buy-one-get-one-free promos during happy hours (3-8:30 PM), large screens for football, DJ-played music from 10 PM, and an electric vibe that''s become central to Da Lat nightlife.', 'bar', 11.9405, 108.4384, '68 Truong Cong Dinh, Ward 1, Da Lat', '$', ARRAY['happy-hour', 'sports-bar', 'dj', 'budget-friendly'], true, 80)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;

-- ===== RESTAURANTS =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('le-rabelais', 'Le Rabelais at Dalat Palace', 'The finest dining in Da Lat, set within the historic 1922 Dalat Palace Heritage Hotel overlooking Xuan Huong Lake. French-Vietnamese fusion at its best — oyster chowder with artichoke, steamed lobster in chili-orange sauce, and an extensive wine cellar. Colonial elegance meets highland cuisine.', 'restaurant', 11.9366, 108.4407, '02 Tran Phu, Ward 3, Da Lat', '$$$$', ARRAY['fine-dining', 'french-vietnamese', 'colonial', 'lake-view'], true, 95),
  ('goc-ha-thanh', 'Góc Hà Thành', 'Authentic Vietnamese dishes in a casual, homey downtown setting. Always buzzing with locals and tourists alike. The pork wontons and coconut chicken curry are legendary. Open 11:30 AM - 9:30 PM with friendly service and a cozy atmosphere that feels like eating at a friend''s home.', 'restaurant', 11.9403, 108.4383, '51 Truong Cong Dinh, Ward 1, Da Lat', '$$', ARRAY['vietnamese', 'local-favorite', 'casual', 'downtown'], true, 85),
  ('kbe-wood-fired', 'K''BE Wood Fired Pizza & BBQ', 'An expat-run gem near Langbiang Mountain where everything comes from the wood-fired oven. Margherita pizza, slow-cooked BBQ pork ribs, and locally sourced highland vegetables. Small family operation with big flavors, perfect for a lunch stop after hiking Langbiang.', 'restaurant', 12.0050, 108.4500, '209 Langbiang, Lac Duong', '$$', ARRAY['wood-fired', 'pizza', 'bbq', 'expat-owned'], true, 80)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;

-- ===== GALLERIES =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('trick-land-3d', 'Trick Land 3D Museum', 'The first 3D painting museum in Da Lat with all paintings done by Vietnamese artists. Interactive installations where visitors pose and create optical illusions — perfect for Instagram. Fun for families and groups who want unique photo memories from the highlands.', 'gallery', 11.9380, 108.4390, '3 Le Thi Hong Gam, Ward 1, Da Lat', '$$', ARRAY['3d-art', 'interactive', 'instagram', 'family-friendly'], true, 85),
  ('lumiere-dalat', 'Lumière Da Lat Light Garden', 'Vietnam''s first Art Gallery and Entertainment Application Center covering 2,000+ sqm. Interactive light art, themed rooms, 3D mapping displays, and immersive installations. A visual feast that merges technology with art, best experienced after sunset.', 'gallery', 11.9640, 108.4380, '222B Mai Anh Dao, Ward 8, Da Lat', '$$', ARRAY['light-art', 'immersive', 'technology', 'evening-experience'], true, 80),
  ('xq-su-quan', 'XQ Historical Village', 'A cultural complex showcasing traditional Vietnamese embroidery art. Walk through themed gardens and studios where artisans hand-embroider intricate works depicting Vietnamese landscapes and daily life. The gallery pieces take months to complete and are true masterpieces of textile art.', 'gallery', 11.9350, 108.4410, '80 Tran Phu, Da Lat', '$$', ARRAY['embroidery', 'traditional-art', 'cultural', 'handcraft'], true, 75)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;

-- ===== PARKS =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('dalat-flower-park', 'Da Lat Flower Park', 'Spanning 7,000+ sqm next to Xuan Huong Lake, this garden showcases 300+ flower varieties blooming year-round. Roses, mimosas, orchids, and hydrangeas create a kaleidoscope of color. The annual Flower Festival transforms it into Da Lat''s most spectacular outdoor venue.', 'park', 11.9430, 108.4470, '2 Tran Nhan Tong, Ward 8, Da Lat', '$', ARRAY['flowers', 'photography', 'lake-adjacent', 'festival-venue'], true, 90),
  ('xuan-huong-lake', 'Xuan Huong Lake', 'The crescent-shaped heart of Da Lat, built in 1919 and surrounded by pine forests. A 7km walking path circles the 25-hectare reservoir. Joggers at dawn, swan boats at noon, couples at sunset — the lake reflects every mood of the city. Free and beautiful 24/7.', 'park', 11.9400, 108.4420, 'Central Da Lat', '$', ARRAY['free', 'lake', 'jogging', 'scenic', 'central'], true, 95),
  ('valley-of-love', 'Valley of Love (Thung Lũng Tình Yêu)', 'Surrounded by misty hills with a tranquil lake, lush gardens, and whimsical sculptures. Rent swan boats, ride horses, or just stroll through shaded paths. The kitsch has a certain charm — and the natural scenery behind it is genuinely breathtaking.', 'park', 11.9779, 108.4494, '3-5-7 Mai Anh Dao, Ward 8, Da Lat', '$', ARRAY['romantic', 'lake', 'gardens', 'boat-rental', 'scenic'], true, 85)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;

-- ===== HOTELS =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('ana-mandara-villas', 'Ana Mandara Villas Dalat Resort & Spa', 'Luxury retreat in restored French colonial villas set among pine-covered hills. Full-service spa, outdoor pool, 24-hour room service, and mountain views from every direction. Each villa has been lovingly restored to its 1920s glory while adding modern comforts.', 'hotel', 11.9441, 108.4237, 'Le Lai Street, Ward 5, Da Lat', '$$$$', ARRAY['luxury', 'colonial', 'spa', 'mountain-view', 'heritage'], true, 95),
  ('dalat-palace-heritage', 'Dalat Palace Heritage Hotel', 'Built in 1922 as a retreat for French colonists, this magnificent palace-style hotel overlooks Xuan Huong Lake. Home to Le Rabelais restaurant, it continues to enchant with architectural elegance, romantic lake views, and a history that spans over a century.', 'hotel', 11.9366, 108.4407, '02 Tran Phu, Ward 3, Da Lat', '$$$$', ARRAY['heritage', 'colonial', 'lake-view', 'historic', 'fine-dining'], true, 90),
  ('le-macaron-boutique', 'Le Macaron City Center Boutique Hotel', 'Modern boutique hotel in the heart of Da Lat, steps from the market and Truong Cong Dinh Street. Features a terrace with city views, allergy-free rooms, an on-site gallery, and free WiFi. The perfect base for exploring Da Lat on foot.', 'hotel', 11.9403, 108.4383, '52 Truong Cong Dinh, Da Lat', '$$', ARRAY['boutique', 'city-center', 'modern', 'gallery', 'walkable'], true, 80)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;

-- ===== COWORKING =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('one-more-cafe-coworking', 'One More Cafe & Coworking', 'The most popular coworking spot in Da Lat for digital nomads and remote workers. Reliable WiFi, specialty coffee, comfortable workspaces, and a community of international professionals. On Hai Ba Trung Street with easy access to cafes and restaurants nearby.', 'coworking', 11.9470, 108.4390, '77 Hai Ba Trung, Ward 6, Da Lat', '$$', ARRAY['digital-nomad', 'wifi', 'community', 'coffee'], true, 90),
  ('dalat-coworking-hub', 'Da Lat Coworking Hub', 'A dedicated coworking space offering hot desks, private offices, and meeting rooms. Fast fiber internet, standing desks, phone booths, and a kitchen. Monthly memberships and day passes available. Perfect for remote workers settling in Da Lat for the season.', 'coworking', 11.9410, 108.4400, 'Truong Cong Dinh, Ward 1, Da Lat', '$$', ARRAY['dedicated-space', 'fiber-internet', 'meeting-rooms', 'monthly-pass'], true, 85),
  ('the-workshop-dalat', 'The Workshop Da Lat', 'Part cafe, part coworking space, The Workshop blends Da Lat''s coffee culture with productive work environments. Ground floor is a bustling cafe; upstairs is a quiet workspace with power outlets, good lighting, and all-day coffee included with your desk fee.', 'coworking', 11.9395, 108.4395, 'Nguyen Chi Thanh, Ward 1, Da Lat', '$$', ARRAY['cafe-workspace', 'quiet-upstairs', 'all-day-coffee', 'productive'], true, 80)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;

-- ===== HOMESTAYS =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('the-wilder-nest', 'The Wilder-nest', 'A stunning valley homestay at the foot of Prenn Pass near Tuyen Lam Lake. Wake to sunshine and forest birds in a space resembling miniature Northern Europe — wooden roofs, climbing vines, and a stream flowing day and night. Pure magic for nature lovers.', 'homestay', 11.9150, 108.4380, 'Tuyen Lam Lake, Ward 3, Da Lat', '$$', ARRAY['nature', 'lake-adjacent', 'european-style', 'tranquil', 'scenic'], true, 90),
  ('lengkeng-dalat', 'LengKeng Da Lat Homestay', 'A poetic hilltop homestay for those who love peace and slow living amidst nature. Nestled on a quiet slope near Xuan Huong Lake with meticulous attention to detail in every corner. Gardens, hammocks, and pine-scented air make it hard to leave.', 'homestay', 11.9370, 108.4350, '57/4 Hoang Hoa Tham, Ward 10, Da Lat', '$$', ARRAY['peaceful', 'hilltop', 'garden', 'slow-living'], true, 85),
  ('mookas-home', 'Mooka''s Home', 'A beloved family-run hostel in the hills with spacious, clean rooms and warm hospitality. 10-minute walk to city center with both private rooms and dorms. Communal kitchen, shared living room, and a backpacker community that keeps travelers returning year after year.', 'homestay', 11.9420, 108.4410, '02 Co Loa, Ward 2, Da Lat', '$', ARRAY['backpacker', 'family-run', 'budget', 'community', 'central'], true, 80)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;

-- ===== OUTDOOR =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('datanla-canyoning', 'Datanla Waterfall Canyoning', 'Vietnam''s most exciting canyoning experience with a 1,500m zipline through forest. Abseil down cliffs, jump into natural pools, slide through water chutes — all taught on-site by certified guides. Asia''s longest zipline caps off a full day of highland adventure.', 'outdoor', 11.9032, 108.4499, 'National Road 20, Prenn Pass, Da Lat', '$$$', ARRAY['canyoning', 'zipline', 'adventure', 'waterfall', 'extreme-sports'], true, 90),
  ('truc-lam-cable-car', 'Truc Lam Cable Car & Robin Hill', 'A 2.3km Austrian-built cable car spanning from Robin Hill to Truc Lam Zen Monastery and Tuyen Lam Lake. 50 brightly painted cabins glide above pine forests for a scenic 15-minute journey. The viewpoint at Robin Hill alone is worth the trip.', 'outdoor', 11.9400, 108.4420, 'Robin Hill, Central Da Lat', '$$', ARRAY['cable-car', 'scenic', 'monastery', 'lake', 'family-friendly'], true, 85),
  ('datanla-high-rope', 'Datanla High Rope Course', 'A recreation zone built around Datanla Waterfall with high rope courses, ziplines, and forest adventure challenges. The 1,000m zipline zooms through scenic pine forest. All-inclusive tickets cover equipment, trainers, and insurance for a full day of outdoor fun.', 'outdoor', 11.9035, 108.4500, 'Datanla Tourist Site, National Highway 20, Da Lat', '$$', ARRAY['high-ropes', 'zipline', 'forest', 'adventure-park', 'family-friendly'], true, 80)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;

-- ===== HIKING (NEW) =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('langbiang-peak', 'Langbiang Peak (Núi Langbiang)', 'Da Lat''s iconic summit at 2,167m, named after the legendary forbidden love between K''Lang and H''Biang. The moderate 3-4 hour round-trip hike passes through pine forests and flowering meadows, rewarding trekkers with 360-degree panoramic views of the Central Highlands and misty Da Lat below.', 'hiking', 12.0196, 108.4244, 'Langbiang Street, Lac Duong, 10km north of Da Lat', '$', ARRAY['summit', 'panoramic-views', 'pine-forest', 'moderate', 'iconic'], true, 95),
  ('tiger-cave-waterfall', 'Tiger Cave Waterfall (Thác Hang Cọp)', 'A stunning 25m waterfall surrounded by pristine jungle, accessible via a challenging trek through wilderness. Rope bridges, river crossings, and diverse flora make it one of the most adventurous and off-the-beaten-path hikes near Da Lat. Named after a legendary tiger that once lived nearby.', 'hiking', 11.9465, 108.4419, 'Tu Son Village, Xuan Tho Commune, 14km east of Da Lat', '$$', ARRAY['waterfall', 'jungle-trek', 'adventure', 'challenging', 'off-beaten-path'], true, 85),
  ('bidoup-nui-ba', 'Bidoup-Núi Bà National Park', 'A UNESCO-recognized biodiversity hotspot encompassing the two highest peaks of the Langbiang Plateau — Bidoup (2,287m) and Núi Bà (2,167m). Multiple routes from easy 3.5km waterfall trails to challenging 30km multi-day expeditions through pristine montane forests home to rare wildlife and endemic plants.', 'hiking', 12.1161, 108.5147, 'Da Nhim Commune, Lac Duong, 50km NE of Da Lat', '$$', ARRAY['national-park', 'biodiversity', 'multi-day', 'wildlife', 'montane-forest'], true, 90)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;

-- ===== VEGETARIAN (NEW) =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('com-chay-au-lac', 'Cơm Chay Âu Lạc', 'Da Lat''s most beloved vegetarian restaurant at the intersection of Phan Dinh Phung and 3/2 Street. Over 50 dishes including pho, bun bo hue, banh mi, and clay pot rice — all vegetarian. Bustling daily with locals and tourists who come for the amazing food and incredible value (15,000-45,000 VND per dish).', 'vegetarian', 11.9459, 108.4348, '15 Phan Dinh Phung, Ward 1, Da Lat', '$', ARRAY['vietnamese-veg', 'budget-friendly', 'central', 'pho', 'local-favorite'], true, 95),
  ('an-lac-tam', 'Ân Lạc Tâm', 'A renowned vegetarian chain with two Da Lat locations offering buffets with about 100 different dishes. From bun bo to pho to mi quang — all expertly prepared in vegetarian style with tofu, eggplant, and beans. Popular with both Buddhists and young food lovers.', 'vegetarian', 11.9365, 108.4415, '104 Bui Thi Xuan, Ward 2, Da Lat', '$', ARRAY['buffet', 'chain', 'variety', '100-dishes', 'buddhist-cuisine'], true, 90),
  ('rau-dawa', 'Rau DAWA Restaurant', 'An upscale vegetarian restaurant within the Tam Trinh Coffee eco-tourism complex, with stunning views of Elephant Waterfall and Linh An Pagoda. Over 50 unique dishes from fresh highland ingredients — five-colored spring rolls, fried mushrooms, creative vegetable preparations in a peaceful pine forest setting.', 'vegetarian', 11.8823, 108.3920, 'Tam Trinh Coffee, Gia Lam, Lam Ha', '$$', ARRAY['upscale', 'eco-tourism', 'waterfall-view', 'highland-ingredients', 'scenic'], true, 85)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;

-- ===== VEGAN (NEW) =====
INSERT INTO venues (slug, name, description, venue_type, latitude, longitude, address, price_range, tags, is_verified, priority_score)
VALUES
  ('hoa-sen-vegetarian', 'Nhà Hàng Chay Hoa Sen', 'A well-established vegan restaurant on Phan Dinh Phung — Da Lat''s vegetarian neighborhood. Traditional Vietnamese cuisine made entirely plant-based with fresh local ingredients. Highly rated on TripAdvisor for authentic flavors, reliable service, and a welcoming atmosphere.', 'vegan', 11.9458, 108.4350, '62 Phan Dinh Phung, Da Lat', '$', ARRAY['100-percent-vegan', 'traditional', 'central', 'tripadvisor-rated'], true, 90),
  ('au-lac-vegan', 'Âu Lạc Vegan Kitchen', 'The vegan-focused sibling of the famous Cơm Chay Âu Lạc, offering 100% plant-based versions of Vietnamese classics. Every dish — from pho to spring rolls to banh cuon — uses zero animal products. A must-visit for vegans exploring Da Lat''s rich food scene.', 'vegan', 11.9460, 108.4350, 'Phan Dinh Phung, Ward 1, Da Lat', '$', ARRAY['100-percent-vegan', 'vietnamese-classics', 'affordable', 'plant-based'], true, 85),
  ('green-dalat-vegan', 'Green Da Lat Vegan Cafe', 'A modern vegan cafe combining plant-based cuisine with Da Lat''s coffee culture. Smoothie bowls with highland berries, vegan banh mi, avocado toast, and specialty lattes. The Instagram-friendly space attracts health-conscious travelers and digital nomads.', 'vegan', 11.9410, 108.4390, 'Nguyen Van Troi, Ward 1, Da Lat', '$$', ARRAY['cafe-style', 'smoothie-bowls', 'modern-vegan', 'instagram-worthy', 'healthy'], true, 80)
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, priority_score = EXCLUDED.priority_score;


-- ============================================
-- 3. Blog category + venue guide posts
-- ============================================

-- Create 'venues' blog category
INSERT INTO blog_categories (slug, name, description, sort_order)
VALUES ('venues', 'Venue Guides', 'In-depth guides to the best venues in Da Lat', 4)
ON CONFLICT (slug) DO NOTHING;

-- Create blog posts for venue guides
-- Each post covers a category with the top 3 venues

INSERT INTO blog_posts (
  source, category_id, title, slug, story_content, technical_content,
  meta_description, seo_keywords, status, published_at, source_locale
)
VALUES
-- CAFES GUIDE
(
  'manual',
  (SELECT id FROM blog_categories WHERE slug = 'venues'),
  'The 3 Best Cafes in Da Lat You Can''t Miss',
  'best-cafes-da-lat',
  E'## Where the Beans Meet the Mist\n\nThere''s something about sipping specialty coffee while fog rolls through pine trees that makes Da Lat''s cafe scene unlike anywhere else in Vietnam.\n\n### La Viet Coffee\nThe undisputed king of Da Lat''s third-wave coffee movement. This industrial-chic space on Nguyen Cong Tru has been redefining highland coffee since 2015. Their cold brew is legendary, but it''s the espresso mocktails — think mulberry juice meets Vietnamese arabica — that make this place truly special. Come early, grab a window seat, and watch Da Lat wake up.\n\n### K''Ho Coffee\nThis isn''t just a cafe — it''s a journey. Drive 10km north to Langbiang''s base and you''ll find a K''Ho ethnic minority family producing some of the cleanest arabica in the highlands. The wooden hut serving area, draped in ethnic textiles, overlooks the very farm where your beans were grown. Farm-to-cup doesn''t get more literal than this.\n\n### Bicycle Up Cafe\nTucked into Truong Cong Dinh Street, this tiny gem rewards coffee purists with an eclectic vintage vibe — an antique bicycle sits atop a piano, vinyl records line the walls, and every cup is pulled with care. The kind of place where you walk in for one espresso and stay for three.',
  E'## Best Cafes in Da Lat - Detailed Guide\n\n### 1. La Viet Coffee\n- **Address:** 200 Nguyen Cong Tru, Da Lat\n- **Price Range:** $$\n- **Must Try:** Cold brew, mulberry espresso mocktail\n- **Best For:** Coffee enthusiasts, Instagram\n- **Hours:** 7:00 AM - 10:00 PM\n\n### 2. K''Ho Coffee\n- **Address:** Bonneur''C Village, Langbiang, Lac Duong\n- **Price Range:** $$\n- **Must Try:** Pour-over highland arabica, espresso\n- **Best For:** Cultural experience, farm visits\n- **Hours:** 8:00 AM - 5:00 PM\n\n### 3. Bicycle Up Cafe\n- **Address:** 82 Truong Cong Dinh, Ward 1, Da Lat\n- **Price Range:** $$\n- **Must Try:** Vietnamese drip coffee, specialty lattes\n- **Best For:** Vintage lovers, coffee purists\n- **Hours:** 7:30 AM - 9:30 PM',
  'Discover the 3 best cafes in Da Lat: La Viet Coffee, K''Ho Coffee, and Bicycle Up Cafe. Specialty highland coffee in Vietnam''s misty city.',
  ARRAY['best cafes Da Lat', 'Da Lat coffee', 'specialty coffee Vietnam', 'La Viet Coffee', 'K''Ho Coffee', 'quán cà phê Đà Lạt'],
  'published',
  now(),
  'en'
),

-- BARS GUIDE
(
  'manual',
  (SELECT id FROM blog_categories WHERE slug = 'venues'),
  'Da Lat After Dark: The 3 Best Bars',
  'best-bars-da-lat',
  E'## Nightlife in the Highlands\n\nDa Lat''s nightlife is nothing like Ho Chi Minh or Hanoi — it''s cooler (literally), cozier, and full of surprises. Here are three bars that define the highland after-dark experience.\n\n### Maze Bar (100 Roofs Cafe)\nImagine a bar designed by someone who watched too many Tim Burton films — in the best possible way. Five floors of twisting passageways, hidden rooms, and spiral staircases, all dimly lit and filled with handcrafted decor. The "maze" is the experience; the drinks are the reward. Make it to the rooftop for Da Lat''s most spectacular night view.\n\n### The Fog On Site\nThe name says it all. This Truong Cong Dinh bar leans into Da Lat''s misty reputation with a fog-machine-enhanced atmosphere and craft cocktails that match the vibe. The bartenders take their craft seriously — Vietnamese-inspired cocktails using local ingredients are the way to go.\n\n### B21 Beer\nIf you''re after cheap drinks and good vibes, B21 is your place. BOGO happy hours from 3-8:30 PM, football on the big screens, and DJs from 10 PM. It''s unpretentious, it''s loud, and it''s exactly where you want to be on a Friday night in the highlands.',
  E'## Best Bars in Da Lat - Detailed Guide\n\n### 1. Maze Bar (100 Roofs Cafe)\n- **Address:** 57 Phan Boi Chau, Ward 1, Da Lat\n- **Price Range:** $$\n- **Must Try:** Any cocktail on the rooftop\n- **Best For:** Unique experience, photos\n- **Hours:** 5:00 PM - 1:00 AM\n\n### 2. The Fog On Site\n- **Address:** 76 Truong Cong Dinh, Da Lat\n- **Price Range:** $$\n- **Must Try:** Vietnamese-inspired craft cocktails\n- **Best For:** Cocktail lovers, date night\n- **Hours:** 5:00 PM - 2:00 AM\n\n### 3. B21 Beer\n- **Address:** 68 Truong Cong Dinh, Ward 1, Da Lat\n- **Price Range:** $\n- **Must Try:** Happy hour BOGO beers\n- **Best For:** Budget nightlife, football, groups\n- **Hours:** 3:00 PM - 2:00 AM',
  'Discover Da Lat''s 3 best bars: Maze Bar, The Fog On Site, and B21 Beer. Highland nightlife from craft cocktails to BOGO beer.',
  ARRAY['Da Lat bars', 'nightlife Da Lat', 'Maze Bar 100 Roofs', 'best bars Vietnam highlands', 'quán bar Đà Lạt'],
  'published',
  now(),
  'en'
),

-- HIKING GUIDE
(
  'manual',
  (SELECT id FROM blog_categories WHERE slug = 'venues'),
  'Hiking Da Lat: 3 Trails Every Trekker Should Know',
  'best-hiking-trails-da-lat',
  E'## Hit the Highland Trails\n\nDa Lat sits at 1,500m elevation surrounded by peaks reaching over 2,200m. The cool climate, pine forests, and mountain roads make it Vietnam''s best hiking destination. Here are three trails that capture the full spectrum — from iconic summit to wild jungle.\n\n### Langbiang Peak\nThe crown jewel. At 2,167m, Langbiang is Da Lat''s symbolic mountain, named after the forbidden love story between K''Lang and H''Biang from local ethnic tribes. The 3-4 hour round-trip hike passes through pine forests and flowering meadows before opening up to 360-degree panoramic views of the entire Central Highlands. Moderate difficulty, suitable for beginners with reasonable fitness.\n\n### Tiger Cave Waterfall (Thác Hang Cọp)\nThis is where it gets real. A full-day trek 14km east of the city takes you through pristine jungle with rope bridges, river crossings, and diverse tropical flora. The reward: a stunning 25-meter waterfall crashing into a misty pool, with a legendary tiger''s cave nearby. Bring a guide, proper shoes, and your sense of adventure.\n\n### Bidoup-Núi Bà National Park\nVietnam''s premier highland trekking destination. This UNESCO-recognized biodiversity hotspot offers everything from easy 3.5km waterfall walks to challenging 30km multi-day expeditions through pristine montane forest. The park protects some of Vietnam''s last remaining primary forests and is home to rare wildlife you won''t see anywhere else.',
  E'## Best Hiking Trails in Da Lat - Detailed Guide\n\n### 1. Langbiang Peak (Núi Langbiang)\n- **Location:** 10km north of Da Lat, Lac Duong\n- **Elevation:** 2,167m\n- **Duration:** 3-4 hours round trip\n- **Difficulty:** Moderate\n- **Best Season:** Nov-Apr (dry season)\n- **Cost:** ~50,000 VND entrance\n\n### 2. Tiger Cave Waterfall (Thác Hang Cọp)\n- **Location:** 14km east, Xuan Tho Commune\n- **Duration:** 6 hours (full day)\n- **Difficulty:** Moderate to Challenging\n- **Best Season:** Nov-Mar\n- **Cost:** ~200,000 VND with guide\n- **Note:** Guide recommended for safety\n\n### 3. Bidoup-Núi Bà National Park\n- **Location:** 50km NE of Da Lat, Lac Duong\n- **Duration:** 2 hours to 3 days (varies by route)\n- **Difficulty:** Easy to Difficult\n- **Best Season:** Year-round (dry season preferred)\n- **Cost:** 60,000-300,000 VND depending on route',
  'Discover the 3 best hiking trails in Da Lat: Langbiang Peak, Tiger Cave Waterfall, and Bidoup National Park. Vietnam highland trekking guide.',
  ARRAY['hiking Da Lat', 'trekking Da Lat', 'Langbiang Peak', 'Bidoup National Park', 'Tiger Cave Waterfall', 'leo núi Đà Lạt', 'best hikes Vietnam'],
  'published',
  now(),
  'en'
),

-- VEGETARIAN GUIDE
(
  'manual',
  (SELECT id FROM blog_categories WHERE slug = 'venues'),
  'Vegetarian Da Lat: 3 Restaurants That Prove Chay Is Anything But Boring',
  'best-vegetarian-restaurants-da-lat',
  E'## The Vegetarian Heart of the Highlands\n\nDa Lat has a thriving vegetarian scene rooted in Buddhist tradition and blessed by the freshest highland produce in Vietnam. "Chay" (vegetarian) restaurants here aren''t afterthoughts — they''re destinations.\n\n### Cơm Chay Âu Lạc\nThe undisputed champion of vegetarian dining in Da Lat. Perched at the intersection of Phan Dinh Phung and 3/2 Street, Âu Lạc serves over 50 dishes that would fool any meat-eater — the "beef" pho, clay pot rice, and banh mi are all stunning. Prices start at 15,000 VND. Yes, really. It''s busy every single day for a reason.\n\n### Ân Lạc Tâm\nWith two locations and about 100 dishes on the buffet, Ân Lạc Tâm is vegetarian abundance personified. Bun bo, pho, mi quang — all expertly crafted with tofu, eggplant, and beans instead of meat. The buffet format means you can try everything, and at Da Lat prices, you absolutely should.\n\n### Rau DAWA\nThis is where vegetarian meets luxury. Set inside the Tam Trinh Coffee eco-tourism complex 30 minutes from Da Lat, Rau DAWA serves 50+ dishes with views of Elephant Waterfall and Linh An Pagoda. Five-colored spring rolls, creative mushroom preparations, and fresh highland vegetables in a pine forest setting. Worth the drive.',
  E'## Best Vegetarian Restaurants in Da Lat - Detailed Guide\n\n### 1. Cơm Chay Âu Lạc\n- **Address:** 15 Phan Dinh Phung, Ward 1, Da Lat\n- **Price Range:** $ (15,000-45,000 VND/dish)\n- **Must Try:** Beef pho, clay pot rice, banh mi\n- **Best For:** Budget dining, local experience\n- **Hours:** 6:00 AM - 9:00 PM\n\n### 2. Ân Lạc Tâm\n- **Address:** 104 Bui Thi Xuan, Ward 2, Da Lat\n- **Price Range:** $ (buffet ~100,000 VND)\n- **Must Try:** Full buffet, mi quang, bun bo\n- **Best For:** Variety, groups, trying everything\n- **Hours:** 10:00 AM - 9:00 PM\n\n### 3. Rau DAWA\n- **Address:** Tam Trinh Coffee, Gia Lam, Lam Ha\n- **Price Range:** $$ (139,000 VND buffet)\n- **Must Try:** Five-colored spring rolls, mushroom dishes\n- **Best For:** Special occasion, scenic dining\n- **Hours:** 10:00 AM - 8:00 PM',
  'Discover the 3 best vegetarian restaurants in Da Lat: Âu Lạc, Ân Lạc Tâm, and Rau DAWA. Authentic Vietnamese chay cuisine from 15,000 VND.',
  ARRAY['vegetarian Da Lat', 'nhà hàng chay Đà Lạt', 'best vegetarian food Vietnam', 'Âu Lạc vegetarian', 'plant-based Da Lat'],
  'published',
  now(),
  'en'
),

-- VEGAN GUIDE
(
  'manual',
  (SELECT id FROM blog_categories WHERE slug = 'venues'),
  'Vegan in Da Lat: Your Complete Plant-Based Guide',
  'vegan-restaurants-da-lat',
  E'## 100% Plant-Based in Vietnam''s Highland City\n\nBeing vegan in Da Lat is surprisingly easy. The city''s Buddhist traditions mean plant-based eating is deeply woven into local culture, and the highland farms supply the freshest vegetables in Vietnam. Here are three spots where every dish is 100% plant-based.\n\n### Nhà Hàng Chay Hoa Sen\nOn Phan Dinh Phung — Da Lat''s unofficial "vegetarian street" — Hoa Sen has built a loyal following for its fully vegan Vietnamese menu. Traditional flavors, fresh ingredients, zero compromise. TripAdvisor''s reviewers consistently praise the authenticity and warmth of this neighborhood gem.\n\n### Âu Lạc Vegan Kitchen\nThe vegan-focused evolution of Da Lat''s most famous chay restaurant. Every single dish — from pho to spring rolls to banh cuon — is 100% plant-based. The same incredible value as the original Âu Lạc but with a strict no-animal-products guarantee. Essential for vegan travelers.\n\n### Green Da Lat Vegan Cafe\nWhere Da Lat''s coffee culture meets modern plant-based dining. Smoothie bowls with highland berries, vegan banh mi, avocado toast, and specialty lattes. The Instagram-friendly space attracts health-conscious travelers and digital nomads who want to work, eat well, and feel good about it.',
  E'## Best Vegan Restaurants in Da Lat - Detailed Guide\n\n### 1. Nhà Hàng Chay Hoa Sen\n- **Address:** 62 Phan Dinh Phung, Da Lat\n- **Price Range:** $\n- **Must Try:** Traditional pho, spring rolls\n- **Best For:** Authentic Vietnamese vegan\n- **Hours:** 7:00 AM - 9:00 PM\n\n### 2. Âu Lạc Vegan Kitchen\n- **Address:** Phan Dinh Phung, Ward 1, Da Lat\n- **Price Range:** $\n- **Must Try:** Vegan pho, banh cuon, spring rolls\n- **Best For:** Budget vegan, Vietnamese classics\n- **Hours:** 6:00 AM - 9:00 PM\n\n### 3. Green Da Lat Vegan Cafe\n- **Address:** Nguyen Van Troi, Ward 1, Da Lat\n- **Price Range:** $$\n- **Must Try:** Smoothie bowls, vegan banh mi\n- **Best For:** Modern vegan, digital nomads\n- **Hours:** 7:00 AM - 8:00 PM',
  'Discover Da Lat''s best vegan restaurants: Hoa Sen, Âu Lạc Vegan Kitchen, and Green Da Lat Cafe. 100% plant-based Vietnamese cuisine.',
  ARRAY['vegan Da Lat', 'vegan restaurants Vietnam', 'plant-based Da Lat', 'vegan food Đà Lạt', 'thuần chay Đà Lạt'],
  'published',
  now(),
  'en'
),

-- RESTAURANTS GUIDE
(
  'manual',
  (SELECT id FROM blog_categories WHERE slug = 'venues'),
  'Eat Like a Local: 3 Best Restaurants in Da Lat',
  'best-restaurants-da-lat',
  E'## From Fine Dining to Street-Side Gems\n\nDa Lat''s restaurant scene spans from colonial-era fine dining to wood-fired mountain cooking. Here are three restaurants that cover the full spectrum — and all are worth crossing town for.\n\n### Le Rabelais at Dalat Palace\nThe finest restaurant in Da Lat, full stop. Set within the 1922 Dalat Palace Heritage Hotel overlooking Xuan Huong Lake, Le Rabelais serves French-Vietnamese fusion that will redefine your expectations. Oyster chowder with artichoke, steamed lobster in chili-orange sauce, and an extensive wine cellar. Dress up and make an evening of it.\n\n### Góc Hà Thành\nThe opposite end of the spectrum — and equally essential. This no-frills downtown spot on Truong Cong Dinh is always packed with locals lining up for pork wontons and coconut chicken curry. Open 11:30 AM to 9:30 PM, the vibe is like eating at your Vietnamese friend''s home, except the cooking is better.\n\n### K''BE Wood Fired Pizza & BBQ\nA delightful surprise near Langbiang Mountain. An expat family runs this wood-fired operation using local highland vegetables and meats. The margherita pizza is legit, the slow-cooked BBQ pork ribs are smoky perfection, and the setting — surrounded by mountain farms — makes it a great lunch after hiking.',
  E'## Best Restaurants in Da Lat - Detailed Guide\n\n### 1. Le Rabelais at Dalat Palace\n- **Address:** 02 Tran Phu, Ward 3, Da Lat\n- **Price Range:** $$$$ (500k-1.5M VND/person)\n- **Cuisine:** French-Vietnamese fusion\n- **Must Try:** Oyster chowder, lobster, wine cellar\n- **Best For:** Special occasions, fine dining\n\n### 2. Góc Hà Thành\n- **Address:** 51 Truong Cong Dinh, Ward 1\n- **Price Range:** $$ (80k-200k VND/person)\n- **Cuisine:** Vietnamese home-style\n- **Must Try:** Pork wontons, coconut chicken curry\n- **Best For:** Local experience, casual dining\n\n### 3. K''BE Wood Fired Pizza & BBQ\n- **Address:** 209 Langbiang, Lac Duong\n- **Price Range:** $$ (150k-350k VND/person)\n- **Cuisine:** Wood-fired international\n- **Must Try:** Margherita pizza, BBQ pork ribs\n- **Best For:** Post-hiking lunch, families',
  'Discover the 3 best restaurants in Da Lat: Le Rabelais fine dining, Góc Hà Thành local cuisine, and K''BE wood-fired pizza near Langbiang.',
  ARRAY['best restaurants Da Lat', 'Da Lat food guide', 'Le Rabelais', 'nhà hàng Đà Lạt', 'where to eat Da Lat'],
  'published',
  now(),
  'en'
),

-- HOTELS GUIDE
(
  'manual',
  (SELECT id FROM blog_categories WHERE slug = 'venues'),
  'Where to Stay in Da Lat: 3 Hotels From Heritage to Boutique',
  'best-hotels-da-lat',
  E'## Sleep in the Highlands\n\nDa Lat''s hotel scene ranges from century-old colonial heritage to modern boutique design. Whether you want to live like a 1920s French colonist or be five minutes from the night market, these three have you covered.\n\n### Ana Mandara Villas Dalat\nDa Lat''s most luxurious stay. French colonial villas from the 1920s have been restored to their former glory and nestled among pine-covered hills. Every villa feels like a private estate with mountain views, and the full-service spa will undo whatever hiking you did that day. This is where you go when the trip deserves to be special.\n\n### Dalat Palace Heritage Hotel\nBuilt in 1922 and still enchanting over a century later. Overlooking Xuan Huong Lake, the Palace has that rare combination of genuine history and genuine comfort. The Le Rabelais restaurant on-site is Da Lat''s finest, and waking up to lake views through colonial-era windows is an experience you''ll remember.\n\n### Le Macaron City Center\nFor those who want to walk everywhere. This modern boutique hotel puts you steps from the market, Truong Cong Dinh Street, and all the cafes and bars. A rooftop terrace, on-site gallery, and allergy-free rooms set it apart from the usual city-center options.',
  E'## Best Hotels in Da Lat - Detailed Guide\n\n### 1. Ana Mandara Villas Dalat Resort & Spa\n- **Address:** Le Lai Street, Ward 5, Da Lat\n- **Price Range:** $150-400 USD/night\n- **Style:** Luxury colonial villas\n- **Best For:** Special occasions, spa retreats\n- **Highlights:** Pool, spa, mountain views\n\n### 2. Dalat Palace Heritage Hotel\n- **Address:** 02 Tran Phu, Ward 3, Da Lat\n- **Price Range:** $100-250 USD/night\n- **Style:** Historic heritage\n- **Best For:** History lovers, romantic stays\n- **Highlights:** Lake views, Le Rabelais restaurant\n\n### 3. Le Macaron City Center\n- **Address:** 52 Truong Cong Dinh, Da Lat\n- **Price Range:** $40-100 USD/night\n- **Style:** Modern boutique\n- **Best For:** City exploration, walkability\n- **Highlights:** Rooftop terrace, gallery, central location',
  'Where to stay in Da Lat: Ana Mandara luxury villas, Dalat Palace heritage, and Le Macaron boutique. Best hotels for every budget.',
  ARRAY['best hotels Da Lat', 'where to stay Da Lat', 'Da Lat accommodation', 'luxury hotels Vietnam highlands', 'khách sạn Đà Lạt'],
  'published',
  now(),
  'en'
),

-- OUTDOOR GUIDE
(
  'manual',
  (SELECT id FROM blog_categories WHERE slug = 'venues'),
  'Outdoor Adventures in Da Lat: Canyoning, Ziplines & Cable Cars',
  'best-outdoor-activities-da-lat',
  E'## Adrenaline Meets Alpine Air\n\nDa Lat isn''t just cafes and flowers — it''s Vietnam''s adventure capital. The highland terrain creates natural playgrounds for canyoning, ziplines, and aerial adventures that you won''t find anywhere else in Southeast Asia.\n\n### Datanla Waterfall Canyoning\nThe flagship adventure. Abseil down waterfalls, jump into natural pools, slide through water chutes, and finish with Asia''s longest zipline at 1,500m. Singapore-certified guides teach you every technique on-site. It''s challenging, exhilarating, and the kind of thing you''ll still be talking about years later.\n\n### Truc Lam Cable Car & Robin Hill\nNot all outdoor adventures need to spike your heart rate. This Austrian-built cable car glides 2.3km above pine forests in 50 brightly painted cabins. Start at Robin Hill for panoramic views, then descend to Truc Lam Zen Monastery and Tuyen Lam Lake. Peaceful, beautiful, and family-friendly.\n\n### Datanla High Rope Course\nFor those who want adventure without the full canyoning commitment. High rope courses, forest challenges, and a 1,000m zipline through pine forest. All-inclusive pricing covers equipment, trainers, and insurance. A perfect half-day that''s accessible to most fitness levels.',
  E'## Best Outdoor Activities in Da Lat - Detailed Guide\n\n### 1. Datanla Waterfall Canyoning\n- **Address:** National Road 20, Prenn Pass\n- **Price:** 800k-1.2M VND/person\n- **Duration:** Full day (6-8 hours)\n- **Difficulty:** Moderate to Challenging\n- **Includes:** Guides, equipment, zipline, lunch\n\n### 2. Truc Lam Cable Car\n- **Address:** Robin Hill, Central Da Lat\n- **Price:** 70k-100k VND round trip\n- **Duration:** 1-2 hours\n- **Difficulty:** Easy\n- **Best For:** Families, scenic views\n\n### 3. Datanla High Rope Course\n- **Address:** Datanla Tourist Site, Highway 20\n- **Price:** ~350k VND all-inclusive\n- **Duration:** Half day (3-4 hours)\n- **Difficulty:** Easy to Moderate\n- **Best For:** Groups, casual adventure',
  'Outdoor adventures in Da Lat: canyoning at Datanla Waterfall, Truc Lam Cable Car, and high rope courses. Vietnam''s adventure capital.',
  ARRAY['outdoor Da Lat', 'canyoning Da Lat', 'zipline Da Lat', 'adventure activities Vietnam', 'hoạt động ngoài trời Đà Lạt'],
  'published',
  now(),
  'en'
),

-- HOMESTAYS GUIDE
(
  'manual',
  (SELECT id FROM blog_categories WHERE slug = 'venues'),
  'Da Lat Homestays: 3 Places That Feel Like Home (But Better)',
  'best-homestays-da-lat',
  E'## Slow Down in the Highlands\n\nThe best way to experience Da Lat isn''t from a hotel lobby — it''s from a hammock on a misty hillside, or a garden cottage beside a stream. These three homestays capture the highland spirit.\n\n### The Wilder-nest\nNestled in a green valley near Tuyen Lam Lake, The Wilder-nest feels like a miniature Northern European village dropped into the Vietnamese highlands. Wooden roofs covered in climbing vines, a stream flowing day and night, and mornings that begin with sunshine and forest bird songs. It''s the kind of place that makes you cancel your next destination.\n\n### LengKeng Da Lat\nA poetic hilltop retreat near Xuan Huong Lake where every detail is curated for slow living. Gardens, hammocks, pine-scented air, and a quiet that lets you actually hear yourself think. Close enough to the city to explore, far enough to feel like an escape.\n\n### Mooka''s Home\nFor the backpacker with taste. This family-run hilltop hostel has been welcoming travelers for years with spacious rooms, a communal kitchen, and warm hospitality. Ten minutes to city center on foot, with both private rooms and dorms. The traveler community here keeps people coming back season after season.',
  E'## Best Homestays in Da Lat - Detailed Guide\n\n### 1. The Wilder-nest\n- **Address:** Tuyen Lam Lake area, Ward 3\n- **Price:** 500k-900k VND/night\n- **Style:** European-inspired nature retreat\n- **Best For:** Couples, nature lovers\n- **Highlights:** Stream, forest, lake proximity\n\n### 2. LengKeng Da Lat\n- **Address:** 57/4 Hoang Hoa Tham, Ward 10\n- **Price:** 400k-800k VND/night\n- **Style:** Hilltop garden retreat\n- **Best For:** Slow travelers, peace seekers\n- **Highlights:** Gardens, hammocks, lake views\n\n### 3. Mooka''s Home\n- **Address:** 02 Co Loa, Ward 2, Da Lat\n- **Price:** 150k-400k VND/night\n- **Style:** Family-run backpacker hostel\n- **Best For:** Budget travelers, community\n- **Highlights:** Kitchen, lounge, central location',
  'Best homestays in Da Lat: The Wilder-nest, LengKeng, and Mooka''s Home. From luxury nature retreats to beloved backpacker hostels.',
  ARRAY['Da Lat homestays', 'best homestay Da Lat', 'where to stay Da Lat budget', 'homestay Đà Lạt', 'backpacker Da Lat'],
  'published',
  now(),
  'en'
);

-- Add source_locale column if it doesn't exist (belt and suspenders)
DO $$ BEGIN
  ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS source_locale text DEFAULT 'en';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
