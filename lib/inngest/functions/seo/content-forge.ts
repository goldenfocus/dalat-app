import { inngest } from '../../client';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { triggerTranslationServer } from '@/lib/translations';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const CONTENT_SYSTEM_PROMPT = `You are a world-class bilingual content writer for dalat.app, the definitive platform for Đà Lạt, Vietnam.

Your job: Transform scraped source material into ORIGINAL, engaging articles. You NEVER copy — you rewrite with fresh perspective, adding local context and community value.

Voice: Warm, knowledgeable, chill. Like a well-traveled friend who lives in Dalat and genuinely loves the city. Never corporate, never clickbait.

Rules:
1. Write ORIGINAL content inspired by sources — never copy paragraphs
2. Always attribute sources: "According to [Source Name]..." or "As reported by [Source]..."
3. Include Dalat-specific context that only a local would know
4. Weave in practical tips for visitors and residents
5. Use both English and Vietnamese terms where natural (e.g., "Đà Lạt" not just "Dalat")
6. Optimize for featured snippets: lead with the answer, then elaborate
7. Include FAQ-worthy questions naturally in the content

Output JSON with these exact fields:
{
  "title": "SEO-optimized title (50-60 chars, include primary keyword)",
  "slug": "url-friendly-slug",
  "story_content": "Human-readable article in markdown (800-1500 words). Engaging narrative, local voice, practical value.",
  "technical_content": "Detailed markdown with facts, data, links, specifications. SEO-dense but readable.",
  "meta_description": "150-char meta description with primary keyword",
  "seo_keywords": ["5-8 relevant keywords"],
  "faq_data": [{"question": "Natural FAQ question?", "answer": "Concise answer (2-3 sentences)"}],
  "social_share_text": "Engaging share text for social media (under 280 chars)",
  "word_count": 1200,
  "internal_link_suggestions": ["related-topic-slugs for internal linking"]
}`;

/**
 * Content Forge — Agent 7
 *
 * The writer. Triggered when a content queue item needs to be written.
 * Pulls context (source articles, related events, venue data, keywords),
 * then uses Claude Sonnet to write original dual-content articles.
 */
export const contentForge = inngest.createFunction(
  {
    id: 'seo-content-forge',
    name: 'SEO Content Forge',
    concurrency: [{ limit: 2 }],
    retries: 2,
  },
  { event: 'seo/content-requested' },
  async ({ event, step }) => {
    const queueItemId = event.data.queueItemId as string;

    // Step 1: Load queue item and check status
    const item = await step.run('load-queue-item', async () => {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('content_queue')
        .select('*')
        .eq('id', queueItemId)
        .single();

      if (error || !data) {
        throw new Error(`Queue item not found: ${queueItemId}`);
      }

      return data;
    });

    if (item.status !== 'pending' && item.status !== 'generating') {
      return { skipped: true, reason: `Item status is ${item.status}` };
    }

    // Step 2: Gather context (sources, events, keywords)
    const context = await step.run('gather-context', async () => {
      const supabase = getSupabase();

      // Mark as generating
      await supabase
        .from('content_queue')
        .update({ status: 'generating', assigned_agent: 'content-forge' })
        .eq('id', queueItemId);

      // Load source articles if source_urls provided
      let sources: Array<{ title: string; content: string; url: string }> = [];
      if (item.source_urls?.length > 0) {
        const { data: sourceRows } = await supabase
          .from('content_sources')
          .select('raw_title, raw_content, source_url, ai_summary')
          .in('source_url', item.source_urls)
          .limit(5);

        sources = (sourceRows || []).map((s: Record<string, string | null>) => ({
          title: s.raw_title || '',
          content: s.ai_summary || s.raw_content?.slice(0, 2000) || '',
          url: s.source_url || '',
        }));
      }

      // Load related events for context
      const { data: recentEvents } = await supabase
        .from('events')
        .select('title, description, starts_at, location_name')
        .eq('status', 'published')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(5);

      // Load keyword targets
      let keywords: string[] = item.target_keywords || [];
      if (keywords.length === 0 && item.content_type) {
        const { data: kwData } = await supabase
          .from('keyword_research')
          .select('keyword')
          .eq('content_exists', false)
          .eq('topic_cluster', item.content_type)
          .order('search_volume_estimate', { ascending: false, nullsFirst: false })
          .limit(5);
        keywords = (kwData || []).map((k: { keyword: string }) => k.keyword);
      }

      return { sources, recentEvents: recentEvents || [], keywords };
    });

    // Step 2: Start agent run tracking
    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .rpc('start_agent_run', {
          p_agent_name: 'content-forge',
        });
      return data as string;
    });

    // Step 3: Generate content with Claude
    const generated = await step.run('generate-content', async () => {
      const client = new Anthropic();

      const sourceMaterial = context.sources.map((s: { title: string; url: string; content: string }, i: number) =>
        `Source ${i + 1}: "${s.title}" (${s.url})\n${s.content}`
      ).join('\n\n---\n\n');

      const eventsContext = context.recentEvents.map((e: Record<string, string | null>) =>
        `- ${e.title} (${e.starts_at?.split('T')[0]}) at ${e.location_name || 'TBD'}`
      ).join('\n');

      const userPrompt = `Write an original ${item.content_type} article.

TITLE/BRIEF: ${item.title}
${item.brief ? `BRIEF: ${item.brief}` : ''}

TARGET KEYWORDS: ${(context.keywords || []).join(', ') || 'none specified'}

SOURCE MATERIAL:
${sourceMaterial || 'No source material — write from general Dalat knowledge.'}

UPCOMING EVENTS IN DALAT (for context):
${eventsContext || 'None loaded.'}

CONTENT TYPE: ${item.content_type}
${item.content_type === 'news' ? 'Focus on timeliness, facts, and source attribution.' : ''}
${item.content_type === 'guide' || item.content_type === 'pillar' ? 'Focus on comprehensiveness, practical tips, and evergreen value.' : ''}
${item.content_type === 'event_preview' ? 'Focus on excitement, logistics, and what to expect.' : ''}
${item.content_type === 'event_recap' ? 'Focus on highlights, community moments, and photos.' : ''}
${item.content_type === 'monthly_guide' ? 'Focus on weather, seasonal events, and travel tips for that month.' : ''}

Return ONLY valid JSON matching the schema described in the system prompt.`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: CONTENT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      let jsonText = textContent.text.trim();
      if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
      if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
      if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);

      const parsed = JSON.parse(jsonText.trim());

      return {
        ...parsed,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    });

    // Step 4: Save as draft blog post
    const postResult = await step.run('save-draft', async () => {
      const supabase = getSupabase();

      // Determine category
      const categoryMap: Record<string, string> = {
        news: 'news',
        guide: 'guides',
        pillar: 'guides',
        event_preview: 'stories',
        event_recap: 'stories',
        monthly_guide: 'seasonal',
        activity_guide: 'activities',
        trend_report: 'news',
      };
      const categorySlug = categoryMap[item.content_type] || 'stories';

      const { data: category } = await supabase
        .from('blog_categories')
        .select('id')
        .eq('slug', categorySlug)
        .single();

      // Ensure slug uniqueness
      let slug = generated.slug || item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
      const { data: existing } = await supabase
        .from('blog_posts')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (existing) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      const { data: post, error } = await supabase
        .from('blog_posts')
        .insert({
          title: generated.title,
          slug,
          story_content: generated.story_content,
          technical_content: generated.technical_content || '',
          meta_description: generated.meta_description,
          seo_keywords: generated.seo_keywords || [],
          social_share_text: generated.social_share_text,
          faq_data: generated.faq_data,
          word_count: generated.word_count || generated.story_content?.split(/\s+/).length,
          reading_time_minutes: Math.ceil((generated.word_count || 1000) / 250),
          internal_links: generated.internal_link_suggestions || [],
          source: item.content_type === 'news' ? 'news_harvest' : 'auto_agent',
          content_type: item.content_type === 'pillar' ? 'pillar' :
                        item.content_type === 'news' ? 'news' :
                        item.content_type === 'monthly_guide' ? 'programmatic' : 'guide',
          status: 'draft',
          category_id: category?.id,
          auto_generated: true,
          data_freshness_at: new Date().toISOString(),
        })
        .select('id, slug')
        .single();

      if (error) throw error;

      // Link queue item to blog post
      await supabase
        .from('content_queue')
        .update({
          status: 'draft',
          blog_post_id: post.id,
        })
        .eq('id', item.id);

      return { postId: post.id, slug: post.slug };
    });

    // Step 5: Send for quality review
    await step.sendEvent('request-review', {
      name: 'seo/content-review',
      data: {
        queueItemId,
        blogPostId: postResult.postId,
        blogPostSlug: postResult.slug,
      },
    });

    // Step 6: Complete agent run
    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      // Estimate cost: ~$3/M input, ~$15/M output for Sonnet
      const estimatedCost =
        (generated.inputTokens / 1_000_000) * 3 +
        (generated.outputTokens / 1_000_000) * 15;

      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: 1,
        p_items_created: 1,
        p_api_calls_claude: 1,
        p_estimated_cost_usd: estimatedCost,
        p_output: {
          postId: postResult.postId,
          slug: postResult.slug,
          wordCount: generated.word_count,
        },
      });
    });

    return {
      success: true,
      postId: postResult.postId,
      slug: postResult.slug,
      wordCount: generated.word_count,
    };
  }
);
