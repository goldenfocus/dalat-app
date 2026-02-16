import type { NewsSource } from './types';

/**
 * DaLat News Source Registry
 * Each source defines how to find and extract Dalat-related articles
 */
export const NEWS_SOURCES: NewsSource[] = [
  {
    id: 'tuoitre',
    name: 'Tuổi Trẻ',
    baseUrl: 'https://tuoitre.vn',
    discoveryUrl: 'https://tuoitre.vn/da-lat.html',
    selectors: {
      articleList: '.box-category-item, .news-item',
      articleLink: 'a[href*="/"]',
      title: 'h1.article-title, h1.detail-title',
      content: '.detail-content, .detail__content',
      image: '.detail-content img, .detail__content img, meta[property="og:image"]',
      date: '.date-time, .detail-time, meta[property="article:published_time"]',
    },
    maxArticles: 30,
    requestDelay: 500,
  },
  {
    id: 'vnexpress',
    name: 'VnExpress',
    baseUrl: 'https://vnexpress.net',
    discoveryUrl: 'https://vnexpress.net/tag/da-lat-1',
    selectors: {
      articleList: '.item-news, article.item-news',
      articleLink: 'a.title-news[href]',
      title: 'h1.title-detail',
      content: '.fck_detail, article.fck_detail',
      image: '.fck_detail img, meta[property="og:image"]',
      date: '.date, meta[property="article:published_time"]',
    },
    maxArticles: 30,
    requestDelay: 500,
  },
  {
    id: 'thanhnien',
    name: 'Thanh Niên',
    baseUrl: 'https://thanhnien.vn',
    discoveryUrl: 'https://thanhnien.vn/da-lat.html',
    selectors: {
      articleList: '.story, .box-news-item',
      articleLink: 'a.story__title[href], a.box-news-link[href]',
      title: 'h1.detail__title',
      content: '.detail__content, .detail-content',
      image: '.detail__content img, meta[property="og:image"]',
      date: '.detail__meta time, meta[property="article:published_time"]',
    },
    maxArticles: 30,
    requestDelay: 500,
  },
  {
    id: 'baophapluat',
    name: 'Báo Pháp Luật',
    baseUrl: 'https://baophapluat.vn',
    discoveryUrl: 'https://baophapluat.vn/da-lat-tag285.html',
    selectors: {
      articleList: '.item-news, .news-item',
      articleLink: 'a[href*=".html"]',
      title: 'h1.title-detail, h1.article-title',
      content: '.content-detail, .article-content',
      image: '.content-detail img, meta[property="og:image"]',
      date: '.date-time, meta[property="article:published_time"]',
    },
    maxArticles: 20,
    requestDelay: 700,
  },
  {
    id: 'congan',
    name: 'Công An TP.HCM',
    baseUrl: 'https://congan.com.vn',
    discoveryUrl: 'https://congan.com.vn/tag/%C4%90%C3%A0+L%E1%BA%A1t.html',
    selectors: {
      articleList: '.item-news, .news-item',
      articleLink: 'a[href*=".html"]',
      title: 'h1.title-detail, h1',
      content: '.detail-content, .content-detail, .article-body',
      image: '.detail-content img, .content-detail img, meta[property="og:image"]',
      date: '.date-time, time, meta[property="article:published_time"]',
    },
    maxArticles: 20,
    requestDelay: 700,
  },
];

export function getSourceById(id: string): NewsSource | undefined {
  return NEWS_SOURCES.find(s => s.id === id);
}

/**
 * Get a source by ID, throwing if not found.
 * Use in scrapers where the source MUST exist at module load time.
 */
export function getSourceOrThrow(id: string): NewsSource {
  const source = NEWS_SOURCES.find(s => s.id === id);
  if (!source) {
    throw new Error(`[news] Source "${id}" not found in NEWS_SOURCES`);
  }
  return source;
}
