#!/usr/bin/env node

/**
 * Blog Autopilot — AI Content Engine for Dalat App
 *
 * Two content streams:
 *
 *   STREAM 1 — Local Intelligence (News)
 *   Da Lat events, tourism trends, cultural happenings, food scene,
 *   seasonal content, festival coverage, local discoveries.
 *
 *   STREAM 2 — SEO Keyword Hunter
 *   Analyzes existing content → identifies keyword gaps →
 *   writes comprehensive posts targeting untapped search queries
 *   about Da Lat tourism, events, and culture.
 *
 * Posts are inserted directly into Supabase blog_posts table.
 * Translations handled by existing content_translations pipeline.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/blog-autopilot.mjs
 *
 * Env vars:
 *   ANTHROPIC_API_KEY    (required)
 *   SUPABASE_URL         (required) — e.g. https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY (required) — service role key
 *   GOOGLE_AI_API_KEY    (optional) — Gemini for cover image generation
 *   BLOG_MODE            'both' | 'news' | 'seo'  (default: 'both')
 *   BLOG_COUNT           posts per stream           (default: 1)
 */

// ─── Config ─────────────────────────────────────────────────────────────────

const API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_KEY = process.env.GOOGLE_AI_API_KEY;
const MODE = process.env.BLOG_MODE || 'both';
const COUNT = Math.min(parseInt(process.env.BLOG_COUNT || '1', 10), 3);
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 8192;
const GEMINI_MODEL = 'gemini-2.0-flash-exp-image-generation';

if (!API_KEY) { console.error('ANTHROPIC_API_KEY is required'); process.exit(1); }
if (!SUPABASE_URL) { console.error('SUPABASE_URL is required'); process.exit(1); }
if (!SUPABASE_KEY) { console.error('SUPABASE_SERVICE_KEY is required'); process.exit(1); }
if (!GEMINI_KEY) console.warn('  GOOGLE_AI_API_KEY not set — skipping cover images');

// ─── Brand Context ──────────────────────────────────────────────────────────

const BRAND_CONTEXT = `You write for Dalat App (dalat.app), the community platform for discovering events and experiences in Da Lat, Vietnam — the "City of Eternal Spring."

VOICE: Warm, enthusiastic, locally informed. Like a well-traveled friend who lives in Da Lat and knows all the hidden gems. Bilingual awareness (Vietnamese + English). Never touristy-cliché, always authentic.

PLATFORM:
- Community events platform for Da Lat, Vietnam
- Event discovery, RSVPs, photo/video moments sharing
- Covers: music, art, food, nightlife, outdoor adventures, cultural events, festivals
- Used by locals, expats, and tourists
- Website: dalat.app

DA LAT FACTS:
- Located in the Central Highlands of Vietnam at 1,500m elevation
- Known as "City of Eternal Spring" — year-round cool climate (15-25°C)
- Population: ~500,000 (Lam Dong province capital)
- Famous for: flower gardens, French colonial architecture, pine forests, waterfalls, coffee culture
- Major attractions: Xuan Huong Lake, Crazy House, Valley of Love, Datanla Falls, Lang Biang Peak
- Food: strawberries, artichoke tea, avocado ice cream, bánh tráng nướng, lẩu gà lá é
- Nightlife: growing bar and live music scene, night markets
- Peak tourism: December–March (dry season), Tet holiday, Da Lat Flower Festival

AUDIENCE: Tourists planning visits, expats living in Da Lat, Vietnamese domestic travelers, event organizers, local businesses.`;

// ─── Claude API ─────────────────────────────────────────────────────────────

async function callClaude(system, user, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      return data.content[0].text;
    } catch (err) {
      console.error(`  Attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

function parseJsonResponse(text) {
  const cleaned = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Failed to parse JSON from: ${text.slice(0, 300)}`);
  }
}

// ─── Supabase Client (PostgREST) ───────────────────────────────────────────

async function supabaseQuery(table, { method = 'GET', body, select, filters = '', single = false } = {}) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  if (select) url.searchParams.set('select', select);
  if (filters) url.pathname += `?${filters}`;

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
  };

  const res = await fetch(url.toString() + (filters && !select ? '' : ''), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${res.status} — ${err.slice(0, 200)}`);
  }

  if (method === 'GET' || headers.Prefer.includes('return=representation')) {
    const data = await res.json();
    return single ? data[0] : data;
  }
}

async function fetchCategories() {
  const url = `${SUPABASE_URL}/rest/v1/blog_categories?select=id,slug,name&order=sort_order`;
  const res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`);
  return res.json();
}

async function fetchRecentPosts(limit = 50) {
  const url = `${SUPABASE_URL}/rest/v1/blog_posts?select=id,title,slug,story_content,seo_keywords,status,category_id,published_at&order=published_at.desc&limit=${limit}&status=eq.published`;
  const res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch posts: ${res.status}`);
  return res.json();
}

async function insertPost(post) {
  const url = `${SUPABASE_URL}/rest/v1/blog_posts`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(post),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Insert failed: ${res.status} — ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data[0];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0];
}

function getExistingContext(posts) {
  return posts
    .map((p, i) => `${i + 1}. "${p.title}" — keywords: ${(p.seo_keywords || []).join(', ')}`)
    .join('\n');
}

function getExistingKeywords(posts) {
  const kw = [...new Set(posts.flatMap((p) => p.seo_keywords || []))];
  return kw.length > 0 ? kw.join(', ') : '(none yet)';
}

function getSeasonalContext() {
  const month = new Date().getMonth();
  const hints = [];
  if (month >= 0 && month <= 2) hints.push("Dry season in Da Lat — peak tourism, cool weather, flower season, Tet holiday preparations");
  if (month >= 3 && month <= 5) hints.push("Transition to rainy season — fewer tourists, local events, coffee harvest season");
  if (month >= 6 && month <= 8) hints.push("Rainy season — misty mornings, indoor events, cozy café culture, summer holidays for students");
  if (month >= 9 && month <= 11) hints.push("Late rainy season into dry — Da Lat Flower Festival (December), Christmas events, year-end celebrations");
  if (month === 0) hints.push("Tet (Lunar New Year) approaching — biggest holiday, flower markets, family events");
  if (month === 11) hints.push("Da Lat Flower Festival season — the city's biggest annual event, flower exhibitions, cultural performances");
  return hints.length > 0 ? `\nSEASONAL CONTEXT: ${hints.join('. ')}.` : '';
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[àáảãạâầấẩẫậăằắẳẵặ]/g, 'a')
    .replace(/[èéẻẽẹêềếểễệ]/g, 'e')
    .replace(/[ìíỉĩị]/g, 'i')
    .replace(/[òóỏõọôồốổỗộơờớởỡợ]/g, 'o')
    .replace(/[ùúủũụưừứửữự]/g, 'u')
    .replace(/[ỳýỷỹỵ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

// ─── Content Format Instructions ────────────────────────────────────────────

const FORMAT_RULES = `CONTENT FORMAT:
- story_content: 200-400 words, warm and engaging, written for humans. Use markdown.
- technical_content: 800-2000 words, comprehensive and SEO-optimized. Use ## headings, ### subheadings, **bold**, - bullet lists, | tables |.
- End technical_content with ## Frequently Asked Questions (3-5 Q&As as ### Question + paragraph)
- Write in English (translations handled automatically for 12 languages)`;

// ─── Stream 1: Local Intelligence (News) ────────────────────────────────────

async function generateNewsPost(posts) {
  console.log('  [NEWS] Generating Da Lat local intelligence...');

  const system = `${BRAND_CONTEXT}

You are a local Da Lat journalist and cultural commentator writing for dalat.app's blog. Your posts provide genuine value — event previews, cultural insights, food discoveries, tourism tips, and local perspectives that visitors and residents find useful.

${FORMAT_RULES}

IMPORTANT: Respond with ONLY a valid JSON object. No markdown fencing, no explanation.`;

  const user = `Today: ${today()}
${getSeasonalContext()}

EXISTING POSTS (do NOT repeat):
${getExistingContext(posts)}

Write about a FRESH topic relevant to Da Lat. Ideas:
- Upcoming events or festival previews
- Hidden gems and local discoveries
- Food scene (new restaurants, street food, coffee shops)
- Outdoor adventures and nature experiences
- Cultural traditions and local customs
- Nightlife and entertainment
- Art, music, and creative scene
- Practical travel tips for visitors
- Expat life and community
- Seasonal activities and weather-based recommendations

Output JSON:
{
  "title": "Engaging Title Under 70 Characters",
  "slug": "kebab-case-max-80-chars",
  "story_content": "200-400 word human story in markdown",
  "technical_content": "800-2000 word SEO content with ## headings, **bold**, - lists, | tables |, ### FAQ",
  "meta_description": "Under 155 chars with primary keyword",
  "seo_keywords": ["5-8 relevant keywords"],
  "category_slug": "stories|guides|news",
  "social_share_text": "Short engaging text for social media (under 200 chars)"
}`;

  const raw = await callClaude(system, user);
  return parseJsonResponse(raw);
}

// ─── Stream 2: SEO Keyword Hunter ───────────────────────────────────────────

async function generateSeoPost(posts) {
  console.log('  [SEO] Generating keyword-targeted post...');

  const system = `${BRAND_CONTEXT}

You are an elite SEO strategist for Da Lat tourism and events content. Your superpower: finding high-value keyword gaps and creating content that RANKS for Da Lat-related queries.

KEYWORD STRATEGY:
- Mix short-tail ("Da Lat events"), medium-tail ("things to do Da Lat weekend"), long-tail ("best coffee shops in Da Lat for digital nomads")
- Target both English AND Vietnamese keyword variations
- Think about "People Also Ask" questions on Google
- Consider voice search ("what's happening in Da Lat this weekend")
- Target queries where dalat.app can realistically rank page 1

${FORMAT_RULES}

Additional SEO rules:
- Headings should answer real search queries
- Include at least ONE comparison table
- Structure for featured snippets
- Front-load important information

IMPORTANT: Respond with ONLY a valid JSON object.`;

  const user = `Today: ${today()}
${getSeasonalContext()}

EXISTING CONTENT:
${getExistingContext(posts)}

KEYWORDS ALREADY TARGETED:
${getExistingKeywords(posts)}

Find the BEST untapped keyword cluster for dalat.app and write a comprehensive post.

Consider these gap areas:
- "Things to do in Da Lat" variations (with kids, for couples, free, rainy day)
- "Da Lat events this week/month/weekend"
- Specific attractions + reviews + tips
- Food guides (best pho, coffee, vegetarian, street food)
- Accommodation + neighborhood guides
- Transportation (how to get to Da Lat, getting around)
- Budget travel / luxury travel Da Lat
- Day trips from Da Lat
- Photography spots
- Seasonal activities
- Nightlife guide
- Digital nomad / remote work in Da Lat

Output JSON:
{
  "title": "SEO-Optimized Title Under 70 Characters",
  "slug": "kebab-case-max-80-chars",
  "story_content": "200-400 word human story in markdown",
  "technical_content": "800-2000 word SEO content with ## headings, **bold**, - lists, | tables |, ### FAQ",
  "meta_description": "Under 155 chars with primary keyword",
  "seo_keywords": ["primary keyword", "secondary", "long-tail 1", "long-tail 2", "more"],
  "category_slug": "guides|stories|news",
  "social_share_text": "Short engaging text (under 200 chars)"
}`;

  const raw = await callClaude(system, user);
  return parseJsonResponse(raw);
}

// ─── Cover Image Generation (Gemini) ────────────────────────────────────────

async function generateCoverImage(title, slug) {
  if (!GEMINI_KEY) return null;

  console.log(`    Generating cover image...`);

  const prompt = `Create an abstract, artistic cover image for a blog post about: ${title}

Style guidelines:
- Modern, clean, atmospheric aesthetic
- Purple and blue gradient background inspired by dalat.app branding
- Abstract geometric shapes or flowing lines relevant to the topic
- Subtle visual elements hinting at Da Lat: misty mountains, pine forests, flowers
- Atmospheric depth with soft glow effects
- NO text, NO lettering, NO words
- Landscape orientation (16:9 aspect ratio)
- Professional and polished feel`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart) {
      console.warn('    No image in Gemini response');
      return null;
    }

    // Upload to Supabase Storage
    const base64 = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType;
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const filename = `covers/autopilot-${slug}.${ext}`;
    const imageBuffer = Buffer.from(base64, 'base64');

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/blog-media/${filename}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': mimeType,
          'x-upsert': 'true',
        },
        body: imageBuffer,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Upload ${uploadRes.status}: ${err.slice(0, 200)}`);
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/blog-media/${filename}`;
    console.log(`    Cover image uploaded`);
    return publicUrl;
  } catch (err) {
    console.warn(`    Cover image failed: ${err.message}`);
    return null;
  }
}

async function updatePostImage(postId, imageUrl) {
  const url = `${SUPABASE_URL}/rest/v1/blog_posts?id=eq.${postId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      cover_image_url: imageUrl,
      cover_image_alt: 'AI-generated cover image for blog post',
    }),
  });
  if (!res.ok) {
    console.warn(`    Failed to update post image: ${res.status}`);
  }
}

// ─── Post Builder ───────────────────────────────────────────────────────────

function buildPost(generated, categoryMap, existingSlugs, stream) {
  let slug = generated.slug || slugify(generated.title);
  if (existingSlugs.has(slug)) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const catSlug = generated.category_slug || 'stories';
  const categoryId = categoryMap[catSlug] || categoryMap['stories'] || null;

  return {
    title: generated.title,
    slug,
    story_content: generated.story_content,
    technical_content: generated.technical_content,
    meta_description: generated.meta_description || null,
    seo_keywords: generated.seo_keywords || [],
    social_share_text: generated.social_share_text || null,
    category_id: categoryId,
    source: stream === 'news' ? 'news_scrape' : 'manual',
    source_locale: 'en',
    status: 'published',
    published_at: new Date().toISOString(),
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Blog Autopilot starting (dalat-app)');
  console.log(`  Mode: ${MODE} | Count: ${COUNT}/stream | Date: ${today()}\n`);

  // Fetch categories and existing posts in parallel
  const [categories, posts] = await Promise.all([
    fetchCategories(),
    fetchRecentPosts(50),
  ]);

  const categoryMap = {};
  for (const cat of categories) {
    categoryMap[cat.slug] = cat.id;
  }

  const existingSlugs = new Set(posts.map((p) => p.slug));
  const newPosts = [];

  console.log(`  Categories: ${categories.map((c) => c.slug).join(', ')}`);
  console.log(`  Existing published posts: ${posts.length}`);
  console.log(`  Tracked keywords: ${[...new Set(posts.flatMap((p) => p.seo_keywords || []))].length}\n`);

  // ── News stream ──
  if (MODE === 'both' || MODE === 'news') {
    for (let i = 0; i < COUNT; i++) {
      try {
        const generated = await generateNewsPost([...posts, ...newPosts.map(p => ({ title: p.title, seo_keywords: p.seo_keywords }))]);
        const post = buildPost(generated, categoryMap, existingSlugs, 'news');
        const inserted = await insertPost(post);
        existingSlugs.add(post.slug);

        // Generate cover image
        const imageUrl = await generateCoverImage(post.title, post.slug);
        if (imageUrl && inserted.id) {
          await updatePostImage(inserted.id, imageUrl);
          inserted.cover_image_url = imageUrl;
        }

        newPosts.push(inserted);

        console.log(`  + NEWS: "${post.title}"`);
        console.log(`    Slug: /${post.slug}`);
        console.log(`    Image: ${imageUrl ? 'yes' : 'skipped'}`);
        console.log(`    Keywords: ${(post.seo_keywords || []).join(', ')}\n`);
      } catch (err) {
        console.error(`  ! News post ${i + 1} failed: ${err.message}\n`);
      }
    }
  }

  // ── SEO stream ──
  if (MODE === 'both' || MODE === 'seo') {
    for (let i = 0; i < COUNT; i++) {
      try {
        const generated = await generateSeoPost([...posts, ...newPosts.map(p => ({ title: p.title, seo_keywords: p.seo_keywords }))]);
        const post = buildPost(generated, categoryMap, existingSlugs, 'seo');
        const inserted = await insertPost(post);
        existingSlugs.add(post.slug);

        // Generate cover image
        const imageUrl = await generateCoverImage(post.title, post.slug);
        if (imageUrl && inserted.id) {
          await updatePostImage(inserted.id, imageUrl);
          inserted.cover_image_url = imageUrl;
        }

        newPosts.push(inserted);

        console.log(`  + SEO: "${post.title}"`);
        console.log(`    Slug: /${post.slug}`);
        console.log(`    Image: ${imageUrl ? 'yes' : 'skipped'}`);
        console.log(`    Keywords: ${(post.seo_keywords || []).join(', ')}\n`);
      } catch (err) {
        console.error(`  ! SEO post ${i + 1} failed: ${err.message}\n`);
      }
    }
  }

  if (newPosts.length > 0) {
    console.log(`Done: ${newPosts.length} post(s) published to Supabase.\n`);
    console.log('--- Summary ---');
    for (const p of newPosts) {
      console.log(`  ${p.title} → dalat.app/blog/${p.slug}`);
    }
  } else {
    console.log('No posts generated.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
