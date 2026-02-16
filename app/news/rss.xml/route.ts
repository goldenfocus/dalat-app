import { createStaticClient } from '@/lib/supabase/server';

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
        news_tags,
        blog_categories!inner(slug)
      `)
      .eq('blog_categories.slug', 'news')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('News RSS feed error:', error);
      return new Response('Error generating feed', { status: 500 });
    }

    const items = (posts || []).map((post: any) => {
      const description = post.meta_description || (post.story_content || '').slice(0, 300);
      const pubDate = post.published_at
        ? new Date(post.published_at).toUTCString()
        : new Date().toUTCString();
      const tags = (post.news_tags || []) as string[];

      return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE_URL}/blog/news/${encodeURIComponent(post.slug)}</link>
      <description>${escapeXml(description)}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${SITE_URL}/blog/news/${encodeURIComponent(post.slug)}</guid>
      ${tags.map(t => `<category>${escapeXml(t)}</category>`).join('\n      ')}
      ${post.cover_image_url ? `<enclosure url="${escapeXml(post.cover_image_url)}" length="0" type="image/jpeg" />` : ''}
    </item>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME}</title>
    <link>${SITE_URL}/news</link>
    <description>Latest news and updates from Da Lat, Vietnam</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/news/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/icon-512.png</url>
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
