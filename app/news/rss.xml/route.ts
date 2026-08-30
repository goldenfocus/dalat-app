import { createStaticClient } from '@/lib/supabase/server';
import { localeUrl } from '@/lib/i18n/locale-url';
import { getNewsPageModifiedAt } from '@/lib/news/article-policy';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://dalat.app';
const SITE_NAME = 'DaLat.app News';

export async function GET() {
  const supabase = createStaticClient();
  if (!supabase) {
    return new Response('Service unavailable', { status: 503 });
  }

  try {
    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select(`
        slug,
        title,
        story_content,
        meta_description,
        cover_image_url,
        published_at,
        source_published_at,
        updated_at,
        source_urls,
        news_tags,
        blog_categories!inner(slug)
      `)
      .eq('blog_categories.slug', 'news')
      .eq('status', 'published')
      .gte('source_published_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('source_published_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('News RSS feed error:', error);
      return new Response('Error generating feed', { status: 500 });
    }

    const feedPosts = (posts || []).map((post: any) => ({
      ...post,
      factualUpdatedAt: getNewsPageModifiedAt(post)
        ?? post.published_at,
    }));
    const items = feedPosts.map((post: any) => {
      const postUrl = localeUrl('en', `/blog/news/${encodeURIComponent(post.slug)}`);
      const description = post.meta_description || (post.story_content || '').slice(0, 300);
      const publicationDate = post.source_published_at ?? post.published_at;
      const pubDate = publicationDate
        ? new Date(publicationDate).toUTCString()
        : new Date().toUTCString();
      const tags = (post.news_tags || []) as string[];

      return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${postUrl}</link>
      <description>${escapeXml(description)}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${postUrl}</guid>
      ${tags.map(t => `<category>${escapeXml(t)}</category>`).join('\n      ')}
      ${post.cover_image_url ? `<enclosure url="${escapeXml(post.cover_image_url)}" length="0" type="image/jpeg" />` : ''}
    </item>`;
    });

    const latestTimestamp = Math.max(
      ...feedPosts.flatMap((post: any) => {
        const timestamp = Date.parse(post.factualUpdatedAt ?? '');
        return Number.isFinite(timestamp) ? [timestamp] : [];
      }),
      0
    );
    const lastBuildDate = latestTimestamp > 0
      ? new Date(latestTimestamp).toUTCString()
      : null;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME}</title>
    <link>${SITE_URL}/news</link>
    <description>Latest news and updates from Da Lat, Vietnam</description>
    <language>en</language>
    ${lastBuildDate ? `<lastBuildDate>${lastBuildDate}</lastBuildDate>` : ''}
    <atom:link href="${SITE_URL}/news/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/android-chrome-512x512.png</url>
      <title>${SITE_NAME}</title>
      <link>${SITE_URL}/news</link>
    </image>
${items.join('\n')}
  </channel>
</rss>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (err) {
    console.error('News RSS feed unexpected error:', err);
    return new Response('Internal server error', { status: 500 });
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
