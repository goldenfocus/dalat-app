-- Re-run the two current tourism reports through the improved evidence repair
-- and routine-bulletin policy. Preserve blog_post_id so any existing draft URL
-- is upgraded in place rather than replaced.
UPDATE news_raw_articles
SET
  status = 'pending',
  cluster_id = NULL,
  processed_at = NULL,
  error_message = NULL
WHERE source_url IN (
  'https://thanhnien.vn/da-lat-dong-khach-dip-le-29-nhung-van-thong-thoang-18526083018314325.htm',
  'https://tuoitre.vn/du-lich-da-lat-xuat-hien-hieu-ung-chua-tung-co-dip-le-2-9-100260829104810907.htm'
);
