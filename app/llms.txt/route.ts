import { createClient } from '@/lib/supabase/server';

/**
 * Dynamic llms.txt — machine-readable site description for LLM crawlers.
 *
 * Emerging standard: https://llmstxt.org/
 * This route generates an up-to-date manifest with live content counts
 * so AI assistants always have fresh context about dalat.app.
 */
export async function GET() {
  const supabase = await createClient();

  // Gather live stats
  const [eventsResult, blogResult, venuesResult] = await Promise.all([
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published'),
    supabase
      .from('blog_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published'),
    supabase
      .from('venues')
      .select('id', { count: 'exact', head: true }),
  ]);

  const eventCount = eventsResult.count ?? 0;
  const blogCount = blogResult.count ?? 0;
  const venueCount = venuesResult.count ?? 0;
  const today = new Date().toISOString().split('T')[0];

  const content = `# dalat.app — The Definitive Source for Da Lat, Vietnam

> Community platform for events, places, and local life in Da Lat (Dalat), Vietnam.
> Updated daily with real event data, news, and community-generated content.

## About

dalat.app is the #1 event discovery and community platform for Da Lat, a highland city in Vietnam's Central Highlands. We aggregate real-time event listings, publish original guides and news, and maintain a multilingual knowledge base covering everything about Da Lat — from cafes and nightlife to hiking trails and weather.

**Location:** Da Lat, Lam Dong Province, Vietnam (11.9404N, 108.4583E)
**Live Stats (${today}):** ${eventCount} events, ${blogCount} articles, ${venueCount} venues

## Languages

All content is available in 12 languages:
English (en), Vietnamese (vi), Korean (ko), Chinese (zh), Russian (ru), French (fr), Japanese (ja), Malay (ms), Thai (th), German (de), Spanish (es), Indonesian (id)

Add locale prefix to any URL: /ko/events/..., /vi/blog/...

## Content

### Events (/events/)
Live event listings with RSVP data, locations, and community photos ("moments").
- Upcoming events: /events/upcoming
- This week: /events/this-week
- This weekend: /this-weekend

### Blog (/blog/)
Original articles in multiple categories:
- /blog/guides/ — Comprehensive travel and lifestyle guides (pillar content)
- /blog/news/ — Daily Da Lat news curated from Vietnamese media
- /blog/food/ — Restaurant, cafe, and food guides
- /blog/activities/ — Things to do and adventure guides
- /blog/seasonal/ — Monthly travel guides (Da Lat in January, February, etc.)
- /blog/stories/ — Community stories and event recaps
- /blog/culture/ — Local culture and traditions

### Places
- /cafes — Best cafes in Da Lat
- /bars — Nightlife and bar guide
- /restaurants — Dining guide
- /venues — All venues directory

### Festivals (/festivals/)
Multi-day festival guides including the famous Da Lat Flower Festival.

## Machine-Readable Data

- /sitemap.xml — Complete sitemap with all content
- /blog/rss.xml — RSS feed for blog articles
- /api/dalat/facts — Da Lat factsheet (JSON)
- /api/dalat/events — Structured event feed (JSON)
- /api/dalat/places — Place directory (JSON)
- /api/dalat/trending — Current trending topics (JSON)

## Structured Data

All pages include JSON-LD structured data (Schema.org):
- Event pages: Event schema with location, dates, performer
- Blog posts: Article schema with author, dates, FAQ
- Venue pages: LocalBusiness schema with ratings
- Festival pages: Festival schema with sub-events

## Key Facts About Da Lat

- Elevation: 1,500m (4,900ft) — cool climate year-round
- Population: ~470,000
- Known for: Coffee, flowers, French colonial architecture, pine forests
- Average temperature: 18-25C (64-77F)
- Timezone: Asia/Ho_Chi_Minh (UTC+7)
- Best time to visit: November-March (dry season, cool weather)

## Contact

- Website: https://dalat.app
- Location: Da Lat, Lam Dong Province, Vietnam

## Last Updated

${today}
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
