import { inngest } from '../../client';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Keyword Scout — Agent 2
 *
 * Weekly keyword research. Identifies high-value Dalat keywords,
 * checks which ones have content, and discovers new long-tail opportunities.
 * Runs Monday 7 AM Vietnam (midnight UTC Monday).
 */
export const keywordScout = inngest.createFunction(
  {
    id: 'seo-keyword-scout',
    name: 'SEO Keyword Scout',
    retries: 2,
  },
  { cron: '0 0 * * 1' }, // Midnight UTC Monday = 7 AM Vietnam Monday
  async ({ step }) => {
    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase.rpc('start_agent_run', {
        p_agent_name: 'keyword-scout',
      });
      return data as string;
    });

    // Step 1: Load existing keywords and published content
    const existing = await step.run('load-existing', async () => {
      const supabase = getSupabase();

      const { data: keywords } = await supabase
        .from('keyword_research')
        .select('keyword, keyword_locale, topic_cluster')
        .limit(500);

      const { data: posts } = await supabase
        .from('blog_posts')
        .select('title, slug, seo_keywords, content_type')
        .eq('status', 'published');

      return {
        existingKeywords: (keywords || []).map((k) => k.keyword),
        publishedSlugs: (posts || []).map((p) => p.slug),
        publishedKeywords: (posts || []).flatMap((p) => p.seo_keywords || []),
      };
    });

    // Step 2: AI-generated keyword research
    const newKeywords = await step.run('discover-keywords', async () => {
      const client = new Anthropic();

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Generate 30 high-value SEO keywords related to Đà Lạt (Dalat), Vietnam for a community events and travel platform.

EXISTING KEYWORDS (don't repeat): ${existing.existingKeywords.slice(0, 50).join(', ')}

Categories to cover:
- Travel planning (getting to Dalat, when to visit, costs)
- Activities (hiking, photography, markets, coffee)
- Food & drink (cafes, restaurants, street food, local specialties)
- Nightlife (bars, live music, events)
- Accommodation (hotels, homestays, neighborhoods)
- Culture (history, temples, local traditions)
- Nature (waterfalls, lakes, flowers, pine forests)
- Practical (weather, transport, tips, digital nomad)

For each keyword, estimate:
- search_volume: 1-10000 (monthly estimated searches)
- difficulty: 1-100 (competition level)
- intent: informational/navigational/commercial/transactional
- topic_cluster: the category above
- is_long_tail: true if 3+ words

Return ONLY valid JSON array:
[{"keyword": "best cafes in dalat", "keyword_locale": "en", "search_volume": 2400, "difficulty": 45, "intent": "commercial", "topic_cluster": "food", "is_long_tail": true}]

Include both English and Vietnamese keywords.`,
        }],
      });

      const text = response.content.find((c) => c.type === 'text');
      if (!text || text.type !== 'text') throw new Error('No response');

      let json = text.text.trim();
      if (json.startsWith('```json')) json = json.slice(7);
      if (json.startsWith('```')) json = json.slice(3);
      if (json.endsWith('```')) json = json.slice(0, -3);

      return JSON.parse(json.trim()) as Array<{
        keyword: string;
        keyword_locale: string;
        search_volume: number;
        difficulty: number;
        intent: string;
        topic_cluster: string;
        is_long_tail: boolean;
      }>;
    });

    // Step 3: Insert new keywords (upsert to avoid duplicates)
    const insertCount = await step.run('insert-keywords', async () => {
      const supabase = getSupabase();
      let count = 0;

      for (const kw of newKeywords) {
        const contentExists = existing.publishedKeywords.some(
          (pk) => pk.toLowerCase() === kw.keyword.toLowerCase()
        );

        const { error } = await supabase
          .from('keyword_research')
          .upsert({
            keyword: kw.keyword,
            keyword_locale: kw.keyword_locale || 'en',
            search_volume_estimate: kw.search_volume,
            difficulty_estimate: kw.difficulty,
            search_intent: kw.intent,
            topic_cluster: kw.topic_cluster,
            is_long_tail: kw.is_long_tail,
            content_exists: contentExists,
          }, {
            onConflict: 'keyword,keyword_locale',
          });

        if (!error) count++;
      }

      return count;
    });

    // Step 4: Mark content_exists for keywords that now have content
    await step.run('update-coverage', async () => {
      const supabase = getSupabase();

      const { data: uncovered } = await supabase
        .from('keyword_research')
        .select('id, keyword')
        .eq('content_exists', false);

      for (const kw of uncovered || []) {
        const hasContent = existing.publishedKeywords.some(
          (pk) => pk.toLowerCase().includes(kw.keyword.toLowerCase())
        );

        if (hasContent) {
          await supabase
            .from('keyword_research')
            .update({ content_exists: true })
            .eq('id', kw.id);
        }
      }
    });

    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: newKeywords.length,
        p_items_created: insertCount,
        p_api_calls_claude: 1,
        p_estimated_cost_usd: 0.005,
      });
    });

    return { success: true, keywordsDiscovered: newKeywords.length, inserted: insertCount };
  }
);
