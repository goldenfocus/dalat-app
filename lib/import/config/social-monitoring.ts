/**
 * Social media monitoring configuration
 *
 * Defines hashtags, pages, and keywords the Social Sentinel agent
 * monitors across platforms. Extend these arrays to widen coverage.
 */

export const MONITORED_HASHTAGS = [
  // Vietnamese
  '#dalat', '#đàlạt', '#dalatcity', '#dalattravel',
  '#datphongdalat', '#cafedalat', '#dulichdalat',
  '#dalatnight', '#danangdalat', '#lamdongtourism',
  // English
  '#dalatvietnam', '#visitdalat', '#dalattravelguide',
  '#dalatfood', '#dalatnightlife', '#dalatcoffee',
  // Korean (large tourist segment)
  '#달랏', '#달랏여행', '#베트남달랏',
  // Chinese
  '#大叻', '#大叻旅游',
] as const;

export const MONITORED_KEYWORDS = [
  'Đà Lạt', 'Da Lat', 'Dalat',
  'Lâm Đồng', 'Lam Dong',
  'dalat cafe', 'dalat nightlife', 'dalat weather',
  'dalat flower festival', 'dalat coffee',
  'dalat hiking', 'dalat market',
  'dalat digital nomad', 'dalat expat',
] as const;

export const DALAT_NEWS_RSS_FEEDS = [
  {
    name: 'VnExpress',
    url: 'https://vnexpress.net/rss/tin-moi-nhat.rss',
    platform: 'vnexpress' as const,
  },
  {
    name: 'Google News - Đà Lạt',
    url: 'https://news.google.com/rss/search?q=%C4%90%C3%A0+L%E1%BA%A1t&hl=vi&gl=VN&ceid=VN:vi',
    platform: 'google_news' as const,
  },
] as const;

export const CONTENT_CATEGORIES = [
  'food', 'cafe', 'nature', 'nightlife', 'culture',
  'accommodation', 'transport', 'weather', 'festival',
  'shopping', 'adventure', 'wellness', 'community',
  'art', 'music', 'photography', 'digital-nomad',
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];
