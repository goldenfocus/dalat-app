import { inngest } from '../../client';
import { createClient } from '@supabase/supabase-js';
import { generateCoverImage } from '@/lib/blog/cover-generator';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Visual Alchemist — Agent 10
 *
 * Generates cover images for blog posts that don't have one.
 * Triggered on demand via seo/image-requested event.
 */
export const visualAlchemist = inngest.createFunction(
  {
    id: 'seo-visual-alchemist',
    name: 'SEO Visual Alchemist',
    concurrency: [{ limit: 2 }],
    retries: 2,
  },
  { event: 'seo/image-requested' },
  async ({ event, step }) => {
    const { blogPostId } = event.data as { blogPostId: string };

    const post = await step.run('load-post', async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('blog_posts')
        .select('id, slug, title, story_content, seo_keywords, cover_image_url, content_type')
        .eq('id', blogPostId)
        .single();
      return data;
    });

    if (!post) return { skipped: true, reason: 'Post not found' };
    if (post.cover_image_url) return { skipped: true, reason: 'Already has cover image' };

    const coverUrl = await step.run('generate-cover', async () => {
      // Build a descriptive prompt from the post content
      const keywords = (post.seo_keywords || []).slice(0, 3).join(', ');
      const prompt = `A beautiful photograph of Đà Lạt, Vietnam related to: ${post.title}. ${keywords ? `Featuring: ${keywords}.` : ''}

Style requirements:
- NO text, NO lettering, NO words in the image
- Landscape orientation (16:9)
- High quality, professional photography style
- Warm, inviting atmosphere capturing Dalat's charm
- Pine forests, misty mountains, French colonial architecture, or café culture as appropriate`;

      return await generateCoverImage(post.slug, prompt);
    });

    if (coverUrl) {
      await step.run('update-post', async () => {
        const supabase = getSupabase();
        await supabase
          .from('blog_posts')
          .update({
            cover_image_url: coverUrl,
            cover_image_alt: `Cover image for ${post.title} - Dalat, Vietnam`,
            cover_image_description: `AI-generated cover image for the article "${post.title}" about Dalat`,
            cover_image_keywords: post.seo_keywords?.slice(0, 5) || [],
          })
          .eq('id', blogPostId);
      });
    }

    return { success: true, coverUrl };
  }
);
