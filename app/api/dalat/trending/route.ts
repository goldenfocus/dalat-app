import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Trending Topics API
 *
 * Machine-readable JSON feed of current trending topics in Da Lat.
 * Powered by Social Sentinel agent analysis of social + news signals.
 */
export async function GET() {
  const supabase = await createClient();

  // Fetch recent trending topics (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: topics, error } = await supabase
    .from('trending_topics')
    .select('*')
    .gte('window_end', thirtyDaysAgo)
    .order('engagement_score', { ascending: false })
    .limit(20);

  // Also fetch latest published news for additional context
  const { data: recentNews } = await supabase
    .from('blog_posts')
    .select('title, slug, published_at, meta_description, blog_categories(slug)')
    .eq('status', 'published')
    .in('source', ['news_harvest', 'auto_agent'])
    .order('published_at', { ascending: false })
    .limit(10);

  const feed = {
    title: 'Trending in Da Lat',
    description: 'Current trending topics, news, and community buzz in Da Lat, Vietnam.',
    website: 'https://dalat.app',
    generated_at: new Date().toISOString(),
    trending_topics: (topics ?? []).map((topic) => ({
      name: topic.topic_name,
      category: topic.topic_category,
      engagement_score: topic.engagement_score,
      mention_count: topic.mention_count,
      trend_velocity: topic.trend_velocity,
      summary: topic.ai_summary,
      window: {
        start: topic.window_start,
        end: topic.window_end,
      },
      cover_image: topic.cover_image_url,
    })),
    recent_news: (recentNews ?? []).map((post) => {
      const cats = post.blog_categories;
      const category = (Array.isArray(cats) ? cats[0] : cats) as { slug: string } | null;
      return {
        title: post.title,
        url: `https://dalat.app/blog/${category?.slug ?? 'news'}/${post.slug}`,
        published_at: post.published_at,
        summary: post.meta_description,
      };
    }),
  };

  return NextResponse.json(feed, {
    headers: {
      'Cache-Control': 'public, max-age=1800, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
