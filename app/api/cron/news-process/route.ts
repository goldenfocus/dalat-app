import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { clusterArticles } from '@/lib/news/clusterer';
import { processNewsCluster } from '@/lib/news/content-processor';
import { calculateQualityScore } from '@/lib/news/quality-scorer';
import { applyInternalLinks } from '@/lib/news/internal-linker';
import { handleNewsImages } from '@/lib/news/image-handler';
import type { ScrapedArticle } from '@/lib/news/types';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const startedAt = Date.now();
  let articleIds: string[] = [];

  try {
    // 0a. Recover articles stranded in 'processing' by a killed run (client
    // timeout / platform limit). Runs are 12h apart, so nothing legitimate
    // is mid-flight when this fires.
    await supabase
      .from('news_raw_articles')
      .update({ status: 'pending' })
      .eq('status', 'processing');

    // 0b. Recover recent articles the LEGACY Vercel deployment poisoned:
    // its crons still run with dead AI keys and mark everything 'skipped'.
    // Re-evaluating a genuinely irrelevant article costs seconds on the
    // free local model. Remove once the legacy project is deleted.
    await supabase
      .from('news_raw_articles')
      .update({ status: 'pending' })
      .eq('status', 'skipped')
      .gte('scraped_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());

    // 1. Load pending raw articles
    const { data: rawArticles, error: fetchError } = await supabase
      .from('news_raw_articles')
      .select('*')
      .eq('status', 'pending')
      .order('scraped_at', { ascending: true })
      // Small batches: keyword extraction runs ~8s/article on the local
      // model and deferred articles get re-clustered next run, so a big
      // batch spends the whole time budget clustering instead of writing.
      .limit(12);

    if (fetchError) {
      console.error('[news-process] Failed to fetch articles:', fetchError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!rawArticles || rawArticles.length === 0) {
      return NextResponse.json({ message: 'No pending articles', skipped: true });
    }

    console.log(`[news-process] Processing ${rawArticles.length} pending articles`);

    // Mark as processing (track IDs for recovery on fatal error)
    articleIds = rawArticles.map(a => a.id);
    await supabase
      .from('news_raw_articles')
      .update({ status: 'processing' })
      .in('id', articleIds);

    // 2. Convert to ScrapedArticle format
    const articles: ScrapedArticle[] = rawArticles.map(a => ({
      sourceId: a.source_id,
      sourceUrl: a.source_url,
      sourceName: a.source_name,
      title: a.title,
      content: a.content,
      imageUrls: a.image_urls || [],
      publishedAt: a.published_at,
    }));

    // 3. Cluster by topic
    const { clusters, skipped } = await clusterArticles(articles);
    console.log(`[news-process] Created ${clusters.length} clusters, ${skipped.length} skipped`);

    // Mark skipped articles (batch by source URLs)
    if (skipped.length > 0) {
      const skippedUrls = skipped.map(a => a.sourceUrl);
      await supabase
        .from('news_raw_articles')
        .update({ status: 'skipped' })
        .in('source_url', skippedUrls);
    }

    // 4. Get news category ID
    const { data: category } = await supabase
      .from('blog_categories')
      .select('id')
      .eq('slug', 'news')
      .single();

    if (!category) {
      console.error('[news-process] News category not found');
      // Reset articles back to pending so they can be retried
      await supabase
        .from('news_raw_articles')
        .update({ status: 'pending' })
        .in('id', articleIds);
      return NextResponse.json({ error: 'News category not found' }, { status: 500 });
    }

    // 5. Process each cluster (time-budgeted: content generation on the
    // local model takes 1-2 min per cluster and Cloudflare cron invocations
    // get ~15 min — leftovers go back to 'pending' for the next run)
    const TIME_BUDGET_MS = 10 * 60 * 1000;
    let postsCreated = 0;
    let errors = 0;
    let deferred = 0;

    for (const cluster of clusters) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        const leftoverUrls = cluster.articles.map(a => a.sourceUrl);
        await supabase
          .from('news_raw_articles')
          .update({ status: 'pending' })
          .in('source_url', leftoverUrls);
        deferred++;
        continue;
      }
      try {
        const clusterSourceUrls = cluster.articles.map(a => a.sourceUrl);

        // Dedup by source: if any article in this cluster already produced a
        // post (a re-processed article gets nondeterministic keywords, so the
        // fingerprint check below can miss), point to that post instead of
        // writing a near-duplicate.
        const { data: alreadyPosted } = await supabase
          .from('news_raw_articles')
          .select('blog_post_id')
          .in('source_url', clusterSourceUrls)
          .not('blog_post_id', 'is', null)
          .limit(1)
          .maybeSingle();

        if (alreadyPosted?.blog_post_id) {
          console.log(`[news-process] Cluster already has a post (${alreadyPosted.blog_post_id}), skipping: ${cluster.keywords.join(', ')}`);
          await supabase
            .from('news_raw_articles')
            .update({ status: 'processed', blog_post_id: alreadyPosted.blog_post_id, processed_at: new Date().toISOString() })
            .in('source_url', clusterSourceUrls);
          continue;
        }

        // Check dedup by content fingerprint
        const { data: existingPost } = await supabase
          .from('blog_posts')
          .select('id')
          .eq('content_fingerprint', cluster.topicFingerprint)
          .maybeSingle();

        if (existingPost) {
          console.log(`[news-process] Duplicate cluster skipped: ${cluster.keywords.join(', ')}`);
          // Mark articles as processed (batch)
          await supabase
            .from('news_raw_articles')
            .update({ status: 'processed', blog_post_id: existingPost.id, processed_at: new Date().toISOString() })
            .in('source_url', clusterSourceUrls);
          continue;
        }

        // Generate content
        const content = await processNewsCluster(cluster);

        // Calculate quality score
        const quality = calculateQualityScore(content);
        console.log(`[news-process] Quality: ${quality.total.toFixed(2)} -> ${quality.suggestedStatus}`);

        // Apply internal links
        const linkedStory = await applyInternalLinks(content.storyContent, content.internalLinks);
        const linkedTechnical = await applyInternalLinks(content.technicalContent);

        // Handle images (pass AI-generated descriptions for fallback cover generation)
        const allImages = cluster.articles.flatMap(a => a.imageUrls);
        const { coverImageUrl, sourceImages } = await handleNewsImages(
          allImages,
          cluster.articles[0].sourceName,
          content.suggestedSlug,
          content.imageDescriptions
        );

        // Generate unique slug
        let slug = content.suggestedSlug || 'dalat-news';
        // Ensure slug is unique
        const { data: slugCheck } = await supabase
          .from('blog_posts')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();

        if (slugCheck) {
          slug = `${slug}-${Date.now().toString(36)}`;
        }

        // Insert blog post
        const now = new Date().toISOString();
        const { data: post, error: insertError } = await supabase
          .from('blog_posts')
          .insert({
            title: content.title,
            slug,
            story_content: linkedStory,
            technical_content: linkedTechnical,
            source: 'news_scrape',
            source_locale: 'vi',
            status: quality.suggestedStatus,
            published_at: quality.suggestedStatus === 'published' ? now : null,
            category_id: category.id,
            meta_description: content.metaDescription,
            seo_keywords: content.seoKeywords,
            cover_image_url: coverImageUrl,
            source_urls: content.sourceUrls,
            source_images: sourceImages,
            quality_score: quality.total,
            news_tags: content.newsTags,
            news_topic: content.newsTopic,
            content_fingerprint: cluster.topicFingerprint,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('[news-process] Insert error:', insertError);
          errors++;
          // Mark articles as error (batch)
          await supabase
            .from('news_raw_articles')
            .update({ status: 'error', error_message: insertError.message })
            .in('source_url', clusterSourceUrls);
          continue;
        }

        postsCreated++;

        // Mark raw articles as processed (batch)
        await supabase
          .from('news_raw_articles')
          .update({
            status: 'processed',
            blog_post_id: post.id,
            processed_at: now,
            cluster_id: cluster.clusterId,
            topic_fingerprint: cluster.topicFingerprint,
            topic_keywords: cluster.keywords,
          })
          .in('source_url', clusterSourceUrls);

        // Translation is handled by the translate-pending cron — translating
        // 4 fields x 12 locales on the local model would blow this cron's
        // time budget.
        console.log(`[news-process] Created post: ${post.id} (${content.title})`);
      } catch (clusterError) {
        console.error(`[news-process] Cluster processing failed:`, clusterError);
        errors++;
        // Mark articles as error (batch)
        const clusterSourceUrls = cluster.articles.map(a => a.sourceUrl);
        await supabase
          .from('news_raw_articles')
          .update({ status: 'error', error_message: String(clusterError) })
          .in('source_url', clusterSourceUrls);
      }
    }

    return NextResponse.json({
      success: true,
      raw_articles: rawArticles.length,
      clusters: clusters.length,
      posts_created: postsCreated,
      clusters_deferred: deferred,
      errors,
      elapsed_s: Math.round((Date.now() - startedAt) / 1000),
    });
  } catch (error) {
    console.error('[news-process] Fatal error:', error);
    // Reset any articles stuck in 'processing' back to 'pending' so they can be retried
    if (articleIds.length > 0) {
      try {
        await supabase
          .from('news_raw_articles')
          .update({ status: 'pending' })
          .in('id', articleIds);
      } catch (resetErr) {
        console.error('[news-process] Failed to reset article status:', resetErr);
      }
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
