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
 * Internal Linker — Agent 14
 *
 * Weekly internal link optimization. Analyzes published content to find
 * cross-linking opportunities and updates the internal_links field.
 * Runs Sunday 1 PM Vietnam (6 AM UTC Sunday).
 */
export const internalLinker = inngest.createFunction(
  {
    id: 'seo-internal-linker',
    name: 'SEO Internal Linker',
    retries: 2,
  },
  { cron: '0 6 * * 0' }, // 6 AM UTC Sunday = 1 PM Vietnam Sunday
  async ({ step }) => {
    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase.rpc('start_agent_run', {
        p_agent_name: 'internal-linker',
      });
      return data as string;
    });

    // Step 1: Load all published content with their keywords
    const contentMap = await step.run('load-content', async () => {
      const supabase = getSupabase();

      const { data: posts } = await supabase
        .from('blog_posts')
        .select('id, slug, title, seo_keywords, internal_links, content_type, category_id')
        .eq('status', 'published');

      // Also get category slugs
      const { data: categories } = await supabase
        .from('blog_categories')
        .select('id, slug');

      const categoryMap: Record<string, string> = {};
      for (const cat of categories || []) {
        categoryMap[cat.id] = cat.slug;
      }

      return {
        posts: (posts || []).map((p) => ({
          ...p,
          categorySlug: p.category_id ? categoryMap[p.category_id] || 'changelog' : 'changelog',
        })),
      };
    });

    // Step 2: Find posts with few or no internal links
    const postsToLink = await step.run('find-link-gaps', async () => {
      return contentMap.posts.filter(
        (p) => !p.internal_links || p.internal_links.length < 3
      ).slice(0, 20); // Process up to 20 per run
    });

    if (postsToLink.length === 0) {
      await step.run('complete-run-empty', async () => {
        const supabase = getSupabase();
        await supabase.rpc('complete_agent_run', {
          p_run_id: runId,
          p_status: 'completed',
          p_items_processed: 0,
          p_estimated_cost_usd: 0,
          p_output: { message: 'All posts have sufficient internal links' },
        });
      });
      return { success: true, updated: 0 };
    }

    // Step 3: Use AI to suggest internal links
    const linkSuggestions = await step.run('suggest-links', async () => {
      const client = new Anthropic();

      // Build a content index for the AI
      const contentIndex = contentMap.posts.map((p) => ({
        slug: `${p.categorySlug}/${p.slug}`,
        title: p.title,
        keywords: (p.seo_keywords || []).join(', '),
        type: p.content_type || 'blog',
      }));

      const postsToAnalyze = postsToLink.map((p) => ({
        id: p.id,
        slug: `${p.categorySlug}/${p.slug}`,
        title: p.title,
        keywords: (p.seo_keywords || []).join(', '),
      }));

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Given these published articles on dalat.app, suggest 3-5 internal links for each article that needs them.

ALL AVAILABLE ARTICLES:
${contentIndex.map((a) => `- /blog/${a.slug} "${a.title}" [${a.keywords}]`).join('\n')}

ARTICLES NEEDING INTERNAL LINKS:
${postsToAnalyze.map((a) => `- ID:${a.id} /blog/${a.slug} "${a.title}" [${a.keywords}]`).join('\n')}

For each article needing links, suggest related articles that would make good contextual links.

Return ONLY valid JSON:
[{"id": "post-uuid", "links": ["/blog/category/slug-1", "/blog/category/slug-2"]}]`,
        }],
      });

      const text = response.content.find((c) => c.type === 'text');
      if (!text || text.type !== 'text') throw new Error('No response');

      let json = text.text.trim();
      if (json.startsWith('```json')) json = json.slice(7);
      if (json.startsWith('```')) json = json.slice(3);
      if (json.endsWith('```')) json = json.slice(0, -3);

      return JSON.parse(json.trim()) as Array<{
        id: string;
        links: string[];
      }>;
    });

    // Step 4: Update posts with internal links
    const updated = await step.run('update-links', async () => {
      const supabase = getSupabase();
      let count = 0;

      for (const suggestion of linkSuggestions) {
        // Validate that linked slugs actually exist
        const validLinks = suggestion.links.filter((link) =>
          contentMap.posts.some((p) => link.includes(p.slug))
        );

        if (validLinks.length > 0) {
          await supabase
            .from('blog_posts')
            .update({ internal_links: validLinks })
            .eq('id', suggestion.id);
          count++;
        }
      }

      return count;
    });

    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: postsToLink.length,
        p_items_created: updated,
        p_api_calls_claude: 1,
        p_estimated_cost_usd: 0.003,
        p_output: {
          postsAnalyzed: postsToLink.length,
          postsUpdated: updated,
          suggestions: linkSuggestions.length,
        },
      });
    });

    return { success: true, analyzed: postsToLink.length, updated };
  }
);
