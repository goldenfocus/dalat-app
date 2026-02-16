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
 * SEO Surgeon — Agent 8
 *
 * Daily audit of meta tags, schema markup, and SEO health.
 * Identifies pages with missing or weak meta descriptions,
 * missing structured data, or other SEO issues.
 * Runs 10 AM Vietnam (3 AM UTC).
 */
export const seoSurgeon = inngest.createFunction(
  {
    id: 'seo-surgeon',
    name: 'SEO Surgeon',
    retries: 2,
  },
  { cron: '0 3 * * *' }, // 3 AM UTC = 10 AM Vietnam
  async ({ step }) => {
    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase.rpc('start_agent_run', {
        p_agent_name: 'seo-surgeon',
      });
      return data as string;
    });

    // Step 1: Find blog posts with missing or weak SEO
    const issues = await step.run('audit-blog-seo', async () => {
      const supabase = getSupabase();

      const { data: posts } = await supabase
        .from('blog_posts')
        .select('id, title, slug, meta_description, seo_keywords, faq_data, word_count, content_type')
        .eq('status', 'published');

      const problems: Array<{
        postId: string;
        slug: string;
        issues: string[];
      }> = [];

      for (const post of posts || []) {
        const postIssues: string[] = [];

        // Missing meta description
        if (!post.meta_description) {
          postIssues.push('missing_meta_description');
        } else if (post.meta_description.length < 100) {
          postIssues.push('short_meta_description');
        } else if (post.meta_description.length > 160) {
          postIssues.push('long_meta_description');
        }

        // Missing keywords
        if (!post.seo_keywords || post.seo_keywords.length === 0) {
          postIssues.push('missing_keywords');
        }

        // Pillar pages should have FAQ data
        if ((post.content_type === 'pillar' || post.content_type === 'guide') && !post.faq_data) {
          postIssues.push('missing_faq_data');
        }

        // Thin content
        if (post.word_count && post.word_count < 300) {
          postIssues.push('thin_content');
        }

        // Title too long (Google truncates at ~60 chars)
        if (post.title.length > 65) {
          postIssues.push('title_too_long');
        }

        if (postIssues.length > 0) {
          problems.push({ postId: post.id, slug: post.slug, issues: postIssues });
        }
      }

      return problems;
    });

    // Step 2: Auto-fix missing meta descriptions with Haiku
    const fixed = await step.run('fix-meta-descriptions', async () => {
      const supabase = getSupabase();
      const client = new Anthropic();
      let fixCount = 0;

      const needsMeta = issues.filter((i) =>
        i.issues.includes('missing_meta_description')
      ).slice(0, 10); // Fix up to 10 per run

      if (needsMeta.length === 0) return fixCount;

      // Load content for posts needing meta
      for (const issue of needsMeta) {
        const { data: post } = await supabase
          .from('blog_posts')
          .select('title, story_content, seo_keywords')
          .eq('id', issue.postId)
          .single();

        if (!post) continue;

        const response = await client.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Write a compelling meta description (140-155 characters) for this article about Dalat, Vietnam.

Title: ${post.title}
Keywords: ${(post.seo_keywords || []).join(', ')}
Content excerpt: ${post.story_content.slice(0, 300)}

Return ONLY the meta description text, nothing else.`,
          }],
        });

        const text = response.content.find((c) => c.type === 'text');
        if (!text || text.type !== 'text') continue;

        const metaDescription = text.text.trim().replace(/^["']|["']$/g, '');

        await supabase
          .from('blog_posts')
          .update({ meta_description: metaDescription })
          .eq('id', issue.postId);

        fixCount++;
      }

      return fixCount;
    });

    // Step 3: Check events for missing SEO fields
    const eventIssues = await step.run('audit-event-seo', async () => {
      const supabase = getSupabase();

      const { data: events } = await supabase
        .from('events')
        .select('id, title, description, ai_tags')
        .eq('status', 'published')
        .is('description', null);

      return (events || []).length;
    });

    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: issues.length,
        p_items_created: fixed,
        p_api_calls_claude: fixed,
        p_estimated_cost_usd: fixed * 0.001,
        p_output: {
          totalIssues: issues.length,
          metaDescriptionsFixed: fixed,
          eventsWithoutDescription: eventIssues,
          issueBreakdown: issues.reduce((acc, i) => {
            for (const issue of i.issues) {
              acc[issue] = (acc[issue] || 0) + 1;
            }
            return acc;
          }, {} as Record<string, number>),
        },
      });
    });

    return {
      success: true,
      totalIssues: issues.length,
      fixed,
      eventsWithoutDescription: eventIssues,
    };
  }
);
