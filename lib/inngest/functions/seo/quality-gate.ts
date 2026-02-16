import { inngest } from '../../client';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { triggerTranslationServer } from '@/lib/translations';
import type { TranslationFieldName } from '@/lib/types';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const QUALITY_REVIEW_PROMPT = `You are the quality editor for dalat.app, reviewing AI-generated content before publication.

Score the article 0-100 across 5 dimensions (20 points each):

1. FACTUAL ACCURACY (0-20): Are claims verifiable? Are sources attributed? No hallucinated facts?
2. TONE & VOICE (0-20): Warm, chill, helpful — like a friend who lives in Dalat. Not corporate, not clickbait. References VIBE.md: playful, culturally aware, bilingual-friendly.
3. SEO QUALITY (0-20): Primary keyword in title + first paragraph? Meta description compelling? FAQ data useful? Internal link suggestions relevant?
4. ORIGINALITY (0-20): Is this genuinely rewritten content, not paraphrased source material? Does it add unique value?
5. READER VALUE (0-20): Would a tourist or expat find this genuinely useful? Practical tips included?

Also check:
- No broken markdown formatting
- No placeholder text like "[insert X]" or "TODO"
- Source attribution present for news articles
- No offensive or inappropriate content

Return ONLY valid JSON:
{
  "total_score": 85,
  "factual_accuracy": 18,
  "tone_voice": 17,
  "seo_quality": 18,
  "originality": 16,
  "reader_value": 16,
  "issues": ["List of specific issues found"],
  "revision_notes": "Specific instructions for improvement if score < 80",
  "recommendation": "publish" | "revise" | "reject"
}`;

/**
 * Quality Gate — Agent 11
 *
 * The editor. Reviews drafted content and auto-publishes if quality >= 80.
 * Sends back for revision at 60-79, rejects below 60.
 */
export const qualityGate = inngest.createFunction(
  {
    id: 'seo-quality-gate',
    name: 'SEO Quality Gate',
    concurrency: [{ limit: 3 }],
    retries: 1,
  },
  { event: 'seo/content-review' },
  async ({ event, step }) => {
    const { queueItemId, blogPostId } = event.data as {
      queueItemId: string;
      blogPostId: string;
      blogPostSlug: string;
    };

    // Step 1: Load the blog post content
    const post = await step.run('load-post', async () => {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('id', blogPostId)
        .single();

      if (error || !data) {
        throw new Error(`Blog post not found: ${blogPostId}`);
      }

      return data;
    });

    // Step 2: Start agent run tracking
    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase.rpc('start_agent_run', {
        p_agent_name: 'quality-gate',
      });
      return data as string;
    });

    // Step 3: AI quality review
    const review = await step.run('review-content', async () => {
      const client = new Anthropic();

      const contentToReview = `
TITLE: ${post.title}
META DESCRIPTION: ${post.meta_description || 'none'}
SEO KEYWORDS: ${(post.seo_keywords || []).join(', ')}

STORY CONTENT (human-readable):
${post.story_content}

TECHNICAL CONTENT (SEO):
${post.technical_content}

FAQ DATA:
${JSON.stringify(post.faq_data || [], null, 2)}

SOURCE: ${post.source}
CONTENT TYPE: ${post.content_type || 'blog'}
`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: QUALITY_REVIEW_PROMPT,
        messages: [{ role: 'user', content: contentToReview }],
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

    const totalScore = review.total_score;

    // Step 4: Act on review result
    if (totalScore >= 80) {
      // AUTO-PUBLISH
      await step.run('auto-publish', async () => {
        const supabase = getSupabase();

        // Publish the blog post
        await supabase
          .from('blog_posts')
          .update({
            status: 'published',
            published_at: new Date().toISOString(),
          })
          .eq('id', blogPostId);

        // Update queue status
        await supabase
          .from('content_queue')
          .update({
            status: 'published',
            quality_score: totalScore,
          })
          .eq('id', queueItemId);
      });

      // Trigger translations for all 12 locales
      await step.run('trigger-translations', async () => {
        const fields: Array<{ field_name: TranslationFieldName; text: string }> = [];

        if (post.title) {
          fields.push({ field_name: 'title', text: post.title });
        }
        if (post.story_content) {
          fields.push({ field_name: 'story_content', text: post.story_content });
        }
        if (post.technical_content) {
          fields.push({ field_name: 'technical_content', text: post.technical_content });
        }
        if (post.meta_description) {
          fields.push({ field_name: 'meta_description', text: post.meta_description });
        }

        if (fields.length > 0) {
          await triggerTranslationServer('blog', blogPostId, fields);
        }
      });

      // Notify Distribution Hub
      await step.sendEvent('notify-publish', {
        name: 'blog/published',
        data: {
          blogPostId,
          blogPostSlug: post.slug,
          title: post.title,
          autoPublished: true,
        },
      });
    } else if (totalScore >= 60) {
      // SEND BACK FOR REVISION
      await step.run('request-revision', async () => {
        const supabase = getSupabase();

        // Get current revision count
        const { data: queueItem } = await supabase
          .from('content_queue')
          .select('revision_count')
          .eq('id', queueItemId)
          .single();

        const revisionCount = (queueItem?.revision_count || 0) + 1;

        // Max 2 revision attempts, then reject
        if (revisionCount > 2) {
          await supabase
            .from('content_queue')
            .update({
              status: 'rejected',
              quality_score: totalScore,
              revision_notes: `Rejected after ${revisionCount} revisions. Latest: ${review.revision_notes}`,
            })
            .eq('id', queueItemId);
          return;
        }

        // Send back to generating state
        await supabase
          .from('content_queue')
          .update({
            status: 'pending',
            quality_score: totalScore,
            revision_notes: review.revision_notes,
            revision_count: revisionCount,
          })
          .eq('id', queueItemId);

        // Re-trigger Content Forge
        await inngest.send({
          name: 'seo/content-requested',
          data: { queueItemId },
        });
      });
    } else {
      // REJECT
      await step.run('reject-content', async () => {
        const supabase = getSupabase();

        await supabase
          .from('content_queue')
          .update({
            status: 'rejected',
            quality_score: totalScore,
            revision_notes: review.revision_notes || 'Quality too low for publication.',
          })
          .eq('id', queueItemId);

        // Archive the draft post
        await supabase
          .from('blog_posts')
          .update({ status: 'archived' })
          .eq('id', blogPostId);
      });
    }

    // Step 5: Complete agent run
    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      const estimatedCost =
        (review.inputTokens / 1_000_000) * 3 +
        (review.outputTokens / 1_000_000) * 15;

      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: 1,
        p_items_created: totalScore >= 80 ? 1 : 0,
        p_api_calls_claude: 1,
        p_estimated_cost_usd: estimatedCost,
        p_output: {
          blogPostId,
          totalScore,
          recommendation: review.recommendation,
          issues: review.issues,
        },
      });
    });

    return {
      success: true,
      blogPostId,
      score: totalScore,
      recommendation: review.recommendation,
      published: totalScore >= 80,
    };
  }
);
