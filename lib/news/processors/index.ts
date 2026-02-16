/**
 * News processor registry - exports all scrapers
 */

export { scrapeTuoiTre } from './tuoitre';
export { scrapeVnExpress } from './vnexpress';
export { scrapeThanhNien } from './thanhnien';
export { scrapeBaoPhapLuat } from './baophapluat';
export { scrapeCongan } from './congan';

import type { ScrapedArticle } from '../types';

export type ScraperFn = () => Promise<ScrapedArticle[]>;

/**
 * Safely execute a scraper, catching any import or runtime errors
 */
async function safeScrape(
  id: string,
  fn: () => Promise<ScrapedArticle[]>
): Promise<ScrapedArticle[]> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[${id}] Scraper failed:`, error);
    return [];
  }
}

/**
 * All scrapers in execution order.
 * Each scraper is lazy-loaded via dynamic import and wrapped in error handling
 * so a single failing scraper does not crash the entire batch.
 */
export const ALL_SCRAPERS: Array<{ id: string; name: string; scrape: ScraperFn }> = [
  { id: 'tuoitre', name: 'Tuổi Trẻ', scrape: () => safeScrape('tuoitre', () => import('./tuoitre').then(m => m.scrapeTuoiTre())) },
  { id: 'vnexpress', name: 'VnExpress', scrape: () => safeScrape('vnexpress', () => import('./vnexpress').then(m => m.scrapeVnExpress())) },
  { id: 'thanhnien', name: 'Thanh Niên', scrape: () => safeScrape('thanhnien', () => import('./thanhnien').then(m => m.scrapeThanhNien())) },
  { id: 'baophapluat', name: 'Báo Pháp Luật', scrape: () => safeScrape('baophapluat', () => import('./baophapluat').then(m => m.scrapeBaoPhapLuat())) },
  { id: 'congan', name: 'Công An', scrape: () => safeScrape('congan', () => import('./congan').then(m => m.scrapeCongan())) },
];
