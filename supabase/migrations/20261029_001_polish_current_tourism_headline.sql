-- The first verified routine bulletin was already published in place. Improve
-- its deterministic headline without changing the canonical URL or facts.
UPDATE blog_posts
SET
  title = 'Tourism attendance: 16,46 triệu lượt khách',
  meta_description = 'Tourism attendance: 16,46 triệu lượt khách',
  news_topic = 'Tourism attendance: 16,46 triệu lượt khách',
  updated_at = now()
WHERE slug = 'economy-amount-45600-ti-dong'
  AND source = 'news_scrape'
  AND title = 'Economy amount: 45.600 tỉ đồng';
