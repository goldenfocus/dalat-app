import { createStaticClient } from '@/lib/supabase/server';
import { getNewsPageModifiedAt } from '@/lib/news/article-policy';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://dalat.app';

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
        published_at,
        source_published_at,
        updated_at,
        source_urls,
        seo_keywords,
        news_tags,
        blog_categories!inner(slug)
      `)
      .eq('blog_categories.slug', 'news')
      .eq('status', 'published')
      // Google News sitemaps are a two-day discovery window. Older URLs stay
      // in the regular sitemap, where their corrected lastmod is preserved.
      .gte('source_published_at', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())
      .order('source_published_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('News sitemap error:', error);
      return new Response('Error generating sitemap', { status: 500 });
    }

    const entries = (posts || []).map((post: any) => {
      const publicationDate = post.source_published_at ?? post.published_at;
      const pubDate = publicationDate
        ? new Date(publicationDate).toISOString()
        : new Date().toISOString();
      const pageModifiedAt = getNewsPageModifiedAt(post);
      const lastModified = pageModifiedAt
        ? new Date(pageModifiedAt).toISOString()
        : pubDate;

      const keywords = [
        ...(post.news_tags || []),
        ...(post.seo_keywords || []),
      ].slice(0, 10).join(', ');

      return `
    <url>
      <loc>${SITE_URL}/blog/news/${encodeURIComponent(post.slug)}</loc>
      <lastmod>${lastModified}</lastmod>
      <news:news>
        <news:publication>
          <news:name>DaLat.app</news:name>
          <news:language>en</news:language>
        </news:publication>
        <news:publication_date>${pubDate}</news:publication_date>
        <news:title>${escapeXml(post.title)}</news:title>
        ${keywords ? `<news:keywords>${escapeXml(keywords)}</news:keywords>` : ''}
      </news:news>
    </url>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries.join('\n')}
</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (err) {
    console.error('News sitemap unexpected error:', err);
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
