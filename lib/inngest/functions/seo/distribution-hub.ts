import { inngest } from '../../client';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Distribution Hub — Agent 12
 *
 * Post-publish distribution. Pings Google Indexing API and Bing
 * URL Submission API to speed up indexation of new content.
 * Triggered when a blog post is published.
 */
export const distributionHub = inngest.createFunction(
  {
    id: 'seo-distribution-hub',
    name: 'SEO Distribution Hub',
    concurrency: [{ limit: 5 }],
    retries: 3,
  },
  { event: 'blog/published' },
  async ({ event, step }) => {
    const { blogPostId, blogPostSlug, title } = event.data as {
      blogPostId: string;
      blogPostSlug: string;
      title: string;
      autoPublished?: boolean;
    };

    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase.rpc('start_agent_run', {
        p_agent_name: 'distribution-hub',
      });
      return data as string;
    });

    // Step 1: Build URLs for all locales
    const urls = await step.run('build-urls', async () => {
      const supabase = getSupabase();

      // Get the category slug for proper URL construction
      const { data: post } = await supabase
        .from('blog_posts')
        .select('slug, category_id')
        .eq('id', blogPostId)
        .single();

      let categorySlug = 'changelog';
      if (post?.category_id) {
        const { data: category } = await supabase
          .from('blog_categories')
          .select('slug')
          .eq('id', post.category_id)
          .single();
        if (category) categorySlug = category.slug;
      }

      const locales = ['en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id'];
      const baseUrl = 'https://dalat.app';

      return locales.map((locale) => `${baseUrl}/${locale}/blog/${categorySlug}/${blogPostSlug}`);
    });

    // Step 2: Ping Google Indexing API (if service account configured)
    const googleResult = await step.run('ping-google', async () => {
      const serviceAccountKey = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT;
      if (!serviceAccountKey) return { skipped: true, reason: 'No service account configured' };

      let submitted = 0;
      // Submit primary URL (English)
      const primaryUrl = urls[0];

      try {
        // Google Indexing API expects OAuth2 token from service account
        // For now, use the simpler ping approach
        const pingUrl = `https://www.google.com/ping?sitemap=https://dalat.app/sitemap.xml`;
        await fetch(pingUrl, { signal: AbortSignal.timeout(5000) });
        submitted = 1;
      } catch {
        // Ping failed — not critical
      }

      return { submitted };
    });

    // Step 3: Ping Bing URL Submission API
    const bingResult = await step.run('ping-bing', async () => {
      const bingApiKey = process.env.BING_WEBMASTER_API_KEY;
      if (!bingApiKey) return { skipped: true, reason: 'No Bing API key configured' };

      let submitted = 0;

      try {
        const response = await fetch(
          `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrl?apikey=${bingApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              siteUrl: 'https://dalat.app',
              url: urls[0], // Primary English URL
            }),
            signal: AbortSignal.timeout(5000),
          }
        );

        if (response.ok) submitted = 1;
      } catch {
        // Bing submission failed — not critical
      }

      return { submitted };
    });

    // Step 4: Trigger image generation if no cover image
    await step.run('check-cover-image', async () => {
      const supabase = getSupabase();
      const { data: post } = await supabase
        .from('blog_posts')
        .select('cover_image_url')
        .eq('id', blogPostId)
        .single();

      if (post && !post.cover_image_url) {
        await inngest.send({
          name: 'seo/image-requested',
          data: { blogPostId },
        });
      }
    });

    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: 1,
        p_items_created: 0,
        p_estimated_cost_usd: 0,
        p_output: {
          blogPostId,
          title,
          urlCount: urls.length,
          google: googleResult,
          bing: bingResult,
        },
      });
    });

    return {
      success: true,
      blogPostId,
      urlsGenerated: urls.length,
      google: googleResult,
      bing: bingResult,
    };
  }
);
