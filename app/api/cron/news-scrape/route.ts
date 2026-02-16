import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ALL_SCRAPERS } from '@/lib/news/processors';
import type { ScrapedArticle } from '@/lib/news/types';

// Lazy init
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const maxDuration = 300; // 5 min timeout

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const results: Record<string, { scraped: number; new: number; skipped: number; errors: number }> = {};
  let totalNew = 0;

  try {
    // Run each scraper sequentially (be respectful to news sites)
    for (const { id, name, scrape } of ALL_SCRAPERS) {
      console.log(`[news-scrape] Starting ${name}...`);
      const sourceResult = { scraped: 0, new: 0, skipped: 0, errors: 0 };

      try {
        const articles: ScrapedArticle[] = await scrape();
        sourceResult.scraped = articles.length;

        for (const article of articles) {
          // Check for duplicate by source URL
          const { data: existing } = await supabase
            .from('news_raw_articles')
            .select('id')
            .eq('source_url', article.sourceUrl)
            .maybeSingle();

          if (existing) {
            sourceResult.skipped++;
            continue;
          }

          // Insert new article
          const { error: insertError } = await supabase
            .from('news_raw_articles')
            .insert({
              source_id: article.sourceId,
              source_url: article.sourceUrl,
              source_name: article.sourceName,
              title: article.title,
              content: article.content,
              image_urls: article.imageUrls,
              published_at: article.publishedAt,
              status: 'pending',
            });

          if (insertError) {
            // Unique constraint violation = concurrent duplicate, count as skipped not error
            if (insertError.code === '23505') {
              sourceResult.skipped++;
            } else {
              console.error(`[news-scrape] Insert error for ${article.sourceUrl}:`, insertError);
              sourceResult.errors++;
            }
          } else {
            sourceResult.new++;
            totalNew++;
          }
        }
      } catch (error) {
        console.error(`[news-scrape] ${name} scraper failed:`, error);
        sourceResult.errors++;
      }

      results[id] = sourceResult;
      console.log(`[news-scrape] ${name}: scraped=${sourceResult.scraped}, new=${sourceResult.new}, skipped=${sourceResult.skipped}, errors=${sourceResult.errors}`);
    }

    return NextResponse.json({
      success: true,
      total_new: totalNew,
      sources: results,
    });
  } catch (error) {
    console.error('[news-scrape] Fatal error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
