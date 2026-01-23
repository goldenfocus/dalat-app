import { inngest } from '../client';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import {
  DAILY_SUMMARY_SYSTEM,
  buildDailySummaryPrompt,
  type DailySummaryOutput,
} from '@/lib/blog/daily-summary-prompt';
import { generateCoverImage } from '@/lib/blog/cover-generator';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily blog summary - runs at 3 AM Vietnam time (8 PM UTC previous day)
 * Fetches commits from last 24h and generates a changelog post
 */
export const dailyBlogSummary = inngest.createFunction(
  {
    id: 'daily-blog-summary',
    name: 'Daily Blog Summary',
  },
  { cron: '0 20 * * *' }, // 8 PM UTC = 3 AM Vietnam
  async ({ step }) => {
    // Step 1: Fetch commits from GitHub
    const commits = await step.run('fetch-commits', async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Try both env var names
      const githubToken = process.env.DALAT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;

      if (!githubToken) {
        throw new Error('GitHub token not configured');
      }

      const repo = process.env.GITHUB_REPO || 'goldenfocus/dalat-app';

      const res = await fetch(
        `https://api.github.com/repos/${repo}/commits?since=${since}`,
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status}`);
      }

      const data = await res.json();
      return data as Array<{
        commit: { message: string; author: { name: string } };
        sha: string;
      }>;
    });

    if (!commits || commits.length === 0) {
      return { skipped: true, message: 'No commits in last 24 hours' };
    }

    const today = new Date().toISOString().split('T')[0];

    // Step 2: Generate AI summary
    const summary = await step.run('generate-summary', async () => {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: DAILY_SUMMARY_SYSTEM,
        messages: [
          {
            role: 'user',
            content: buildDailySummaryPrompt(
              commits.map((c) => ({
                message: c.commit.message.split('\n')[0],
                author: c.commit.author.name,
                sha: c.sha,
              })),
              today
            ),
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      let jsonText = textContent.text.trim();
      if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
      if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
      if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);

      return JSON.parse(jsonText.trim()) as DailySummaryOutput;
    });

    // Step 3: Create or update blog post
    const postResult = await step.run('create-post', async () => {
      const supabase = getSupabase();

      // Get changelog category
      const { data: category } = await supabase
        .from('blog_categories')
        .select('id')
        .eq('slug', 'changelog')
        .single();

      // Check if post exists
      const { data: existingPost } = await supabase
        .from('blog_posts')
        .select('id, slug, cover_image_url')
        .eq('summary_date', today)
        .eq('source', 'daily_summary')
        .single();

      if (existingPost) {
        // Update existing
        await supabase
          .from('blog_posts')
          .update({
            title: summary.title,
            story_content: summary.story_content || '',
            technical_content: summary.technical_content,
            areas_changed: summary.areas_changed,
            meta_description: summary.one_line_summary,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPost.id);

        return { id: existingPost.id, slug: existingPost.slug, updated: true, coverImageUrl: existingPost.cover_image_url };
      }

      // Create new
      const slug = `daily-update-${today}`;
      const finalStatus = summary.suggested_status || 'draft';

      const { data: post, error } = await supabase
        .from('blog_posts')
        .insert({
          title: summary.title,
          slug,
          story_content: summary.story_content || '',
          technical_content: summary.technical_content,
          source: 'daily_summary',
          status: finalStatus,
          published_at: finalStatus === 'published' ? new Date().toISOString() : null,
          category_id: category?.id,
          summary_date: today,
          areas_changed: summary.areas_changed,
          seo_keywords: [],
          meta_description: summary.one_line_summary,
        })
        .select()
        .single();

      if (error) throw error;
      return { id: post.id, slug: post.slug, updated: false, coverImageUrl: null };
    });

    // Step 4: Generate cover image if missing
    if (!postResult.coverImageUrl && summary.image_prompt) {
      await step.run('generate-cover', async () => {
        const enhancedPrompt = `${summary.image_prompt}

Style requirements:
- NO text, NO lettering, NO words in the image
- Landscape orientation (16:9)
- High quality, professional look
- Suitable as a blog post cover image`;

        const coverUrl = await generateCoverImage(postResult.slug, enhancedPrompt);

        const supabase = getSupabase();
        await supabase
          .from('blog_posts')
          .update({ cover_image_url: coverUrl })
          .eq('id', postResult.id);

        return coverUrl;
      });
    }

    return {
      success: true,
      postId: postResult.id,
      updated: postResult.updated,
      areasChanged: summary.areas_changed,
    };
  }
);
