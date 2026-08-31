import { createClient } from '@supabase/supabase-js';
import { noStoreJson } from '@/lib/http/no-store-json';
import { clusterArticles } from '@/lib/news/clusterer';
import {
  generateNewsContent,
  verifyNewsCluster,
} from '@/lib/news/content-processor';
import { calculateVerificationQualityScore } from '@/lib/news/quality-scorer';
import { applyInternalLinks } from '@/lib/news/internal-linker';
import { handleNewsImages } from '@/lib/news/image-handler';
import type { NewsImage } from '@/lib/news/image-handler';
import { logPipelineEvent } from '@/lib/news/pipeline-log';
import { normalizeStoryContent } from '@/lib/blog/normalize-content';
import {
  acceptedFactsHaveChanged,
  getNewsContentUpdatedAt,
  mergeSourceRecords,
  resolveNewsPublishedAt,
  resolveNewsPublicationStatus,
  stampNewsSourceEnvelope,
} from '@/lib/news/article-policy';
import { storedSourceUrls } from '@/lib/news/legacy-recovery';
import {
  evaluateNewsFreshness,
  editorialReviewApprovesNewArticle,
  newestSourcePublication,
  resolveEditorialPublicationCandidate,
} from '@/lib/news/freshness-policy';
import type { NewsContentOutput, ScrapedArticle } from '@/lib/news/types';
import { stripHtml } from '@/lib/news/base-scraper';

const NextResponse = { json: noStoreJson };

interface ExistingNewsPost {
  id: string;
  slug: string;
  status: string;
  published_at: string | null;
  updated_at: string;
  title: string;
  story_content: string;
  technical_content: string;
  meta_description: string | null;
  cover_image_url: string | null;
  source_urls: unknown;
  source_images: NewsImage[] | null;
}

function rawRowToArticle(row: Record<string, unknown>): ScrapedArticle {
  return {
    sourceId: String(row.source_id ?? ''),
    sourceUrl: String(row.source_url ?? ''),
    sourceName: String(row.source_name ?? ''),
    // Normalize again at consumption time so already-ingested rows benefit
    // from scraper fixes without mutating their source snapshot first.
    title: stripHtml(String(row.title ?? '')),
    content: stripHtml(String(row.content ?? '')),
    imageUrls: Array.isArray(row.image_urls) ? row.image_urls.map(String) : [],
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
    retrievedAt: typeof row.scraped_at === 'string' ? row.scraped_at : undefined,
  };
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  const routeDeadlineAt = startedAt + 240_000;
  const runId = crypto.randomUUID();
  let articleIds: string[] = [];

  try {
    // 0a. Recover only expired processing leases. processed_at is the lease
    // timestamp while status=processing; resetting every processing row here
    // allowed an overlapping manual/cron run to steal active work.
    const staleLeaseBefore = new Date(Date.now() - 2 * 3600_000).toISOString();
    await supabase
      .from('news_raw_articles')
      .update({ status: 'pending', cluster_id: null, processed_at: null })
      .eq('status', 'processing')
      .or(`processed_at.is.null,processed_at.lt.${staleLeaseBefore}`);

    // 1. Load pending raw articles
    const { data: pendingArticles, error: fetchError } = await supabase
      .from('news_raw_articles')
      .select('*')
      .eq('status', 'pending')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('scraped_at', { ascending: false })
      // Include enough adjacent fresh reporting for two independent
      // publishers covering the same story to meet the corroboration gate.
      // The route deadline still defers any clusters it cannot finish.
      .limit(8);

    if (fetchError) {
      console.error('[news-process] Failed to fetch articles:', fetchError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!pendingArticles || pendingArticles.length === 0) {
      return NextResponse.json({ message: 'No pending articles', skipped: true });
    }

    // Defense in depth for rows created by an older deployment: linked rows
    // may reverify an established URL at any age, but a new URL needs a real,
    // recent source timestamp before it can consume the generation pipeline.
    const processableArticles = pendingArticles.filter((article) => {
      if (article.blog_post_id) return true;
      return evaluateNewsFreshness(article.published_at).autoPublishEligible;
    });
    const heldArticles = pendingArticles.filter((article) => {
      if (article.blog_post_id) return false;
      const disposition = evaluateNewsFreshness(article.published_at).disposition;
      return disposition !== 'fresh' && disposition !== 'historical';
    });
    const historicalArticles = pendingArticles.filter((article) => {
      if (article.blog_post_id) return false;
      return evaluateNewsFreshness(article.published_at).disposition === 'historical';
    });
    const reviewedAt = new Date().toISOString();
    if (heldArticles.length > 0) {
      await supabase
        .from('news_raw_articles')
        .update({
          status: 'review',
          processed_at: reviewedAt,
          editorial_disposition: 'needs-review',
          editorial_review_reason: 'Freshness gate requires an editor before processing',
          editorial_reviewed_at: reviewedAt,
        })
        .in('id', heldArticles.map(article => article.id))
        .eq('status', 'pending');
    }
    if (historicalArticles.length > 0) {
      await supabase
        .from('news_raw_articles')
        .update({
          status: 'skipped',
          processed_at: reviewedAt,
          editorial_disposition: 'historical',
          editorial_review_reason: 'Historical backlog cannot enter Latest News',
          editorial_reviewed_at: reviewedAt,
        })
        .in('id', historicalArticles.map(article => article.id))
        .eq('status', 'pending');
    }
    if (processableArticles.length === 0) {
      return NextResponse.json({
        message: 'No genuinely fresh pending articles',
        held_for_review: heldArticles.length,
        historical_quarantined: historicalArticles.length,
        skipped: true,
      });
    }

    // Atomically lease only rows that are still pending. Overlapping runs may
    // read the same candidates, but exactly one receives each claimed row.
    const leaseStartedAt = new Date().toISOString();
    const pendingIds = processableArticles.map((article) => article.id);
    const { data: rawArticles, error: claimError } = await supabase
      .from('news_raw_articles')
      .update({
        status: 'processing',
        cluster_id: runId,
        processed_at: leaseStartedAt,
      })
      .in('id', pendingIds)
      .eq('status', 'pending')
      .select('*');
    if (claimError) {
      throw new Error(`Failed to claim pending articles: ${claimError.message}`);
    }
    if (!rawArticles || rawArticles.length === 0) {
      return NextResponse.json({ message: 'Pending articles claimed by another run', skipped: true });
    }

    console.log(`[news-process] Processing ${rawArticles.length} claimed articles`);
    await logPipelineEvent(supabase, {
      runId,
      stage: 'news-process',
      level: 'info',
      message: 'Run started',
      meta: { rawArticles: rawArticles.length },
    });

    // Track only rows leased by this run for owner-filtered cleanup.
    articleIds = rawArticles.map(a => a.id);

    // 2. Convert to ScrapedArticle format
    const articles: ScrapedArticle[] = rawArticles.map(rawRowToArticle);

    // 3. Cluster by topic
    const {
      clusters,
      skipped,
      deferred: clusteringDeferred,
      failed: clusteringFailed,
    } = await clusterArticles(articles, routeDeadlineAt);
    console.log(`[news-process] Created ${clusters.length} clusters, ${skipped.length} skipped, ${clusteringDeferred.length} deferred, ${clusteringFailed.length} failed`);

    if (clusteringDeferred.length > 0) {
      await supabase
        .from('news_raw_articles')
        .update({ status: 'pending', cluster_id: null, processed_at: null })
        .in('source_url', clusteringDeferred.map((article) => article.sourceUrl))
        .eq('status', 'processing')
        .eq('cluster_id', runId);
    }

    if (clusteringFailed.length > 0) {
      await supabase
        .from('news_raw_articles')
        .update({
          status: 'error',
          cluster_id: null,
          processed_at: new Date().toISOString(),
          error_message: 'Clustering failed; retry required',
        })
        .in('source_url', clusteringFailed.map((article) => article.sourceUrl))
        .eq('status', 'processing')
        .eq('cluster_id', runId);
    }

    // Mark skipped articles (batch by source URLs)
    if (skipped.length > 0) {
      const skippedUrls = skipped.map(a => a.sourceUrl);
      const { error: skipError } = await supabase
        .from('news_raw_articles')
        .update({ status: 'skipped', cluster_id: null, processed_at: new Date().toISOString() })
        .in('source_url', skippedUrls)
        .eq('status', 'processing')
        .eq('cluster_id', runId);
      if (skipError) {
        await logPipelineEvent(supabase, {
          runId,
          stage: 'news-process',
          level: 'error',
          message: `Failed to mark articles skipped: ${skipError.message}`,
        });
      }
    }

    // 4. Get news category ID
    const { data: category } = await supabase
      .from('blog_categories')
      .select('id')
      .eq('slug', 'news')
      .single();

    if (!category) {
      console.error('[news-process] News category not found');
      await logPipelineEvent(supabase, {
        runId,
        stage: 'news-process',
        level: 'error',
        message: 'News category not found — run aborted, articles reset to pending',
      });
      // Reset articles back to pending so they can be retried
      await supabase
        .from('news_raw_articles')
        .update({ status: 'pending', cluster_id: null, processed_at: null })
        .in('id', articleIds)
        .eq('status', 'processing')
        .eq('cluster_id', runId);
      return NextResponse.json({ error: 'News category not found' }, { status: 500 });
    }

    // Build a source-URL identity index from every established automated page,
    // including legacy rows that predate news_raw_articles.blog_post_id. This
    // is the final duplicate guard: even if recovery attaches identity while a
    // processor run is already in flight, the established public URL wins.
    const establishedAutomatedPosts: ExistingNewsPost[] = [];
    const legacyPageSize = 1000;
    for (let from = 0; ; from += legacyPageSize) {
      const { data: page, error: legacyPostsError } = await supabase
        .from('blog_posts')
        .select('id, slug, status, published_at, updated_at, title, story_content, technical_content, meta_description, cover_image_url, source_urls, source_images')
        .eq('source', 'news_scrape')
        // Removed pages still own their source identity. Excluding them would
        // let rediscovery mint a replacement URL and bypass an editorial or
        // legal archive/deprecation decision.
        .in('status', ['draft', 'published', 'experimental', 'deprecated', 'archived'])
        .order('id', { ascending: true })
        .range(from, from + legacyPageSize - 1);
      if (legacyPostsError) {
        throw new Error(`Legacy source identity inventory failed: ${legacyPostsError.message}`);
      }
      establishedAutomatedPosts.push(...((page ?? []) as ExistingNewsPost[]));
      if ((page?.length ?? 0) < legacyPageSize) break;
    }
    const legacyPostsById = new Map(establishedAutomatedPosts.map((post) => [post.id, post]));
    const legacyPostIdsBySourceUrl = new Map<string, Set<string>>();
    for (const post of establishedAutomatedPosts) {
      for (const sourceUrl of storedSourceUrls(post.source_urls)) {
        const postIds = legacyPostIdsBySourceUrl.get(sourceUrl) ?? new Set<string>();
        postIds.add(post.id);
        legacyPostIdsBySourceUrl.set(sourceUrl, postIds);
      }
    }

    // 5. Process each cluster (time-budgeted: content generation on the
    // local model takes 1-2 min per cluster. Leave enough time for database
    // cleanup before the platform's five-minute hard limit.
    const TIME_BUDGET_MS = 230_000;
    const MIN_CLUSTER_PROCESSING_MS = 45_000;
    let postsCreated = 0;
    let postsUpdated = 0;
    let editorialHeld = 0;
    let editorialRejected = 0;
    let errors = clusteringFailed.length;
    let deferred = 0;

    for (const cluster of clusters) {
      if (
        Date.now() - startedAt > TIME_BUDGET_MS
        || routeDeadlineAt - Date.now() < MIN_CLUSTER_PROCESSING_MS
      ) {
        const leftoverUrls = cluster.articles.map(a => a.sourceUrl);
        await supabase
          .from('news_raw_articles')
          .update({ status: 'pending', cluster_id: null, processed_at: null })
          .in('source_url', leftoverUrls)
          .eq('status', 'processing')
          .eq('cluster_id', runId);
        deferred++;
        continue;
      }
      try {
        const clusterSourceUrls = cluster.articles.map(a => a.sourceUrl);

        // Resolve an established article ID before generating. A matching
        // source or fingerprint is a correction/reverification target, never
        // a reason to mint another URL.
        const { data: alreadyPostedRows, error: alreadyPostedError } = await supabase
          .from('news_raw_articles')
          .select('blog_post_id')
          .in('source_url', clusterSourceUrls)
          .not('blog_post_id', 'is', null);
        if (alreadyPostedError) {
          throw new Error(`Source identity lookup failed: ${alreadyPostedError.message}`);
        }

        const establishedPostIds = [...new Set([
          ...(alreadyPostedRows ?? [])
            .map((row) => row.blog_post_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
          ...clusterSourceUrls.flatMap((sourceUrl) => [
            ...(legacyPostIdsBySourceUrl.get(sourceUrl) ?? []),
          ]),
        ])];
        if (establishedPostIds.length > 1) {
          throw new Error(
            `Cluster spans multiple established URLs (${establishedPostIds.join(', ')}); manual merge review required`
          );
        }

        let existingPost: ExistingNewsPost | null = null;
        if (establishedPostIds[0]) {
          existingPost = legacyPostsById.get(establishedPostIds[0]) ?? null;
          if (!existingPost) {
            const { data, error: establishedPostError } = await supabase
              .from('blog_posts')
              .select('id, slug, status, published_at, updated_at, title, story_content, technical_content, meta_description, cover_image_url, source_urls, source_images')
              .eq('id', establishedPostIds[0])
              .maybeSingle();
            if (establishedPostError) {
              throw new Error(
                `Established post lookup failed for ${establishedPostIds[0]}: ${establishedPostError.message}`
              );
            }
            if (!data) {
              throw new Error(
                `Established post ${establishedPostIds[0]} is missing; refusing to mint a replacement URL`
              );
            }
            existingPost = data as ExistingNewsPost | null;
          }
          if (existingPost?.status === 'archived' || existingPost?.status === 'deprecated') {
            throw new Error(
              `Established source belongs to ${existingPost.status} post ${existingPost.id}; manual review required`
            );
          }
        }

        if (!existingPost) {
          // A topic fingerprint is made from AI-selected keywords, so it is a
          // duplicate warning—not authority to overwrite an established URL.
          const { data: fingerprintMatches, error: fingerprintError } = await supabase
            .from('blog_posts')
            .select('id, slug')
            .eq('content_fingerprint', cluster.topicFingerprint)
            .order('updated_at', { ascending: false })
            .limit(3);
          if (fingerprintError) {
            throw new Error(`Fingerprint lookup failed: ${fingerprintError.message}`);
          }
          if ((fingerprintMatches?.length ?? 0) > 0) {
            throw new Error(
              `Possible duplicate of /${fingerprintMatches![0].slug}; source identity does not match, manual review required`
            );
          }
        }

        // A dedicated editorial classifier reviews topic value before factual
        // verification/generation. It may hold or reject a new URL, but it can
        // never override the deterministic source-date gate above. Established
        // URLs bypass this creation gate so corrections remain possible.
        if (!existingPost) {
          const review = cluster.editorialReview;
          const approved = editorialReviewApprovesNewArticle(review);
          if (!approved) {
            const rejected = review.disposition === 'reject';
            await supabase
              .from('news_raw_articles')
              .update({
                status: rejected ? 'skipped' : 'review',
                cluster_id: null,
                processed_at: new Date().toISOString(),
                editorial_disposition: review.disposition,
                editorial_review_reason: review.reason,
                editorial_reviewed_at: new Date().toISOString(),
              })
              .in('source_url', clusterSourceUrls)
              .eq('status', 'processing')
              .eq('cluster_id', runId);
            if (rejected) editorialRejected++;
            else editorialHeld++;
            continue;
          }
        }

        // Pull every stored source already attached to this canonical article
        // into the verification pass. New corroboration strengthens the same
        // URL; it is not discarded as a duplicate.
        let processingCluster = cluster;
        if (existingPost) {
          const { data: linkedRows, error: linkedRowsError } = await supabase
            .from('news_raw_articles')
            .select('source_id, source_url, source_name, title, content, image_urls, published_at, scraped_at')
            .eq('blog_post_id', existingPost.id)
            .limit(12);
          if (linkedRowsError) {
            throw new Error(`Linked source lookup failed: ${linkedRowsError.message}`);
          }

          const byUrl = new Map(cluster.articles.map(article => [article.sourceUrl, article]));
          for (const row of linkedRows ?? []) {
            const article = rawRowToArticle(row);
            if (article.sourceUrl) byUrl.set(article.sourceUrl, article);
          }
          processingCluster = { ...cluster, articles: [...byUrl.values()] };
          console.log(`[news-process] Re-verifying existing post ${existingPost.id} at /${existingPost.slug}`);
        }

        // Verify before rewriting. Source order, retrieval time, and additional
        // corroboration do not change the accepted-fact fingerprint, so an
        // established article keeps its editorial copy unless the facts do.
        const evidence = await verifyNewsCluster(processingCluster, routeDeadlineAt);
        const factsChanged = !existingPost || acceptedFactsHaveChanged(
          existingPost.source_urls,
          evidence.acceptedFactFingerprint
        );
        const quality = calculateVerificationQualityScore(evidence.verification);
        console.log(`[news-process] Quality: ${quality.total.toFixed(2)} -> ${quality.suggestedStatus}`);

        let content: NewsContentOutput | null = null;
        let linkedStory: string | null = null;
        let linkedTechnical: string | null = null;
        let slug = existingPost?.slug ?? null;
        let coverImageUrl = existingPost?.cover_image_url ?? null;
        let sourceImages = existingPost?.source_images ?? [];

        if (factsChanged) {
          content = await generateNewsContent(processingCluster, evidence, routeDeadlineAt);

          // Apply internal links + normalize markdown only to a real factual
          // revision. Unchanged articles preserve human edits byte-for-byte.
          linkedStory = normalizeStoryContent(
            await applyInternalLinks(content.storyContent)
          );
          linkedTechnical = await applyInternalLinks(content.technicalContent);

          // The canonical slug is immutable once a post exists. For a genuinely
          // new story, an unexplained collision is held for investigation.
          slug = existingPost?.slug || content.suggestedSlug || 'dalat-news';
          if (!existingPost) {
            const { data: slugCheck } = await supabase
              .from('blog_posts')
              .select('id')
              .eq('slug', slug)
              .maybeSingle();
            if (slugCheck) {
              throw new Error(`Slug collision for "${slug}"; refusing to create a duplicate URL`);
            }
          }

          // Preserve an existing cover through corrections. New posts (or a
          // corrected legacy post with no cover) may adopt a real source image.
          if (!coverImageUrl) {
            const allImages = processingCluster.articles.flatMap(a => a.imageUrls);
            const imageResult = await handleNewsImages(
              allImages,
              processingCluster.articles[0].sourceName,
              slug,
              content.title,
              content.imageDescriptions,
              {
                deadlineAt: routeDeadlineAt - 10_000,
                generateFallback: false,
              }
            );
            coverImageUrl = imageResult.coverImageUrl;
            sourceImages = imageResult.sourceImages;
          }
        }

        if (!slug) throw new Error('Verified news article has no canonical slug');

        const now = new Date().toISOString();
        const contentUpdatedAt = factsChanged
          ? now
          : getNewsContentUpdatedAt(existingPost?.source_urls) ?? existingPost?.updated_at ?? now;
        const mergedSources = stampNewsSourceEnvelope(
          // Only currently accepted evidence is public. Historical/rejected
          // provenance needs a revision table; re-stamping it here would make
          // a source that no longer supports a claim look freshly verified.
          mergeSourceRecords(null, evidence.sourceUrls),
          evidence.acceptedFactFingerprint,
          contentUpdatedAt
        );
        const sourcePublishedAt = newestSourcePublication(
          evidence.sourceUrls.map(source => source.published_at)
        );
        const freshness = evaluateNewsFreshness(sourcePublishedAt);
        const publicationCandidate = resolveEditorialPublicationCandidate({
          freshness,
          review: cluster.editorialReview,
          verificationStatus: quality.suggestedStatus,
          existingUrl: existingPost !== null,
        });
        const nextStatus = resolveNewsPublicationStatus(
          existingPost?.status ?? null,
          publicationCandidate
        );

        const postValues = {
          source_urls: mergedSources,
          // Corroboration can change while the accepted fact fingerprint stays
          // stable. Persist confidence/status without rewriting the article.
          quality_score: quality.total,
          status: nextStatus,
          source_published_at: sourcePublishedAt,
          first_seen_at: existingPost ? undefined : now,
          editorial_disposition: existingPost
            ? 'update'
            : publicationCandidate === 'published'
              ? 'current-news'
              : 'needs-review',
          editorial_review_reason: freshness.autoPublishEligible
            ? cluster.editorialReview.reason
            : freshness.reason,
          editorial_reviewed_at: now,
          // The newest accepted source is the news peg. Import, approval, and
          // reverification times never make an old story look newly published.
          published_at: resolveNewsPublishedAt(existingPost, nextStatus, sourcePublishedAt),
          ...(factsChanged && content && linkedStory !== null && linkedTechnical !== null
            ? {
                title: content.title,
                story_content: linkedStory,
                technical_content: linkedTechnical,
                source: 'news_scrape',
                source_locale: 'en',
                meta_description: content.metaDescription,
                seo_keywords: content.seoKeywords,
                cover_image_url: coverImageUrl,
                source_images: sourceImages,
                news_tags: content.newsTags,
                news_topic: content.newsTopic,
                content_fingerprint: cluster.topicFingerprint,
              }
            : {}),
        };

        const writeQuery = existingPost
          ? supabase.from('blog_posts').update(postValues).eq('id', existingPost.id)
          : supabase.from('blog_posts').insert({
              ...postValues,
              slug,
              category_id: category.id,
            });
        const { data: postRows, error: writeError } = await writeQuery.select('id, updated_at');
        const post = postRows?.[0];

        if (writeError || !post) {
          console.error('[news-process] Write error:', writeError);
          errors++;
          await logPipelineEvent(supabase, {
            runId,
            stage: 'news-process',
            level: 'error',
            message: `Write failed for cluster: ${writeError?.message ?? 'no row returned'}`,
            meta: { topic: cluster.keywords.join(', '), slug },
          });
          // Mark articles as error (batch)
          await supabase
            .from('news_raw_articles')
            .update({
              status: 'error',
              cluster_id: null,
              processed_at: now,
              error_message: writeError?.message ?? 'no row returned',
            })
            .in('source_url', clusterSourceUrls)
            .eq('status', 'processing')
            .eq('cluster_id', runId);
          continue;
        }

        // Store the corrected source revision first, then remove derivative
        // automatic translations. The worker performs matching pre/post source
        // checks, so either ordering of an in-flight job is fail-closed.
        // Reviewed/edited translations remain human-owned and are never removed.
        if (existingPost) {
          let translationQuery = supabase
            .from('content_translations')
            .delete()
            .eq('content_type', 'blog')
            .eq('content_id', existingPost.id)
            .eq('translation_status', 'auto');
          if (!factsChanged) {
            // Also finish cleanup after a prior post-write/delete failure.
            // The generic row timestamp advances on provenance-only refreshes;
            // translations are stale only relative to the factual body revision.
            translationQuery = translationQuery.lt(
              'updated_at',
              contentUpdatedAt
            );
          }
          const { error: translationError } = await translationQuery;
          if (translationError) {
            throw new Error(`Failed to invalidate stale translations: ${translationError.message}`);
          }
        }

        if (existingPost) postsUpdated++;
        else postsCreated++;

        // Mark raw articles as processed (batch)
        const { data: markedRows, error: markError } = await supabase
          .from('news_raw_articles')
          .update({
            status: 'processed',
            blog_post_id: post.id,
            processed_at: now,
            cluster_id: cluster.clusterId,
            topic_fingerprint: cluster.topicFingerprint,
            topic_keywords: cluster.keywords,
            editorial_disposition: existingPost ? 'update' : cluster.editorialReview.disposition,
            editorial_review_reason: cluster.editorialReview.reason,
            editorial_reviewed_at: now,
          })
          .in('source_url', clusterSourceUrls)
          .eq('status', 'processing')
          .eq('cluster_id', runId)
          .select('id');
        if (markError || markedRows?.length !== clusterSourceUrls.length) {
          await logPipelineEvent(supabase, {
            runId,
            stage: 'news-process',
            postId: post.id,
            level: 'error',
            message: `Failed to mark every owned article processed: ${
              markError?.message ?? `expected ${clusterSourceUrls.length}, updated ${markedRows?.length ?? 0}`
            }`,
          });
        }

        // Missing translations are discovered and rebuilt by the Mac mini worker.

        console.log(
          `[news-process] ${existingPost ? 'Updated' : 'Created'} post: ${post.id} `
          + `(${content?.title ?? existingPost?.title ?? slug}; ${factsChanged ? 'facts revised' : 'provenance refreshed'})`
        );
      } catch (clusterError) {
        const isDeadlineError = Date.now() >= routeDeadlineAt - 1_000
          || (clusterError instanceof Error && /deadline|abort|timed?\s*out/iu.test(clusterError.message));
        if (isDeadlineError) {
          deferred++;
          await supabase
            .from('news_raw_articles')
            .update({ status: 'pending', cluster_id: null, processed_at: null, error_message: null })
            .in('source_url', cluster.articles.map((article) => article.sourceUrl))
            .eq('status', 'processing')
            .eq('cluster_id', runId);
          continue;
        }
        console.error(`[news-process] Cluster processing failed:`, clusterError);
        errors++;
        await logPipelineEvent(supabase, {
          runId,
          stage: 'news-process',
          level: 'error',
          message: `Cluster processing failed: ${clusterError instanceof Error ? clusterError.message : String(clusterError)}`,
          meta: { topic: cluster.keywords.join(', ') },
        });
        // Mark articles as error (batch)
        const clusterSourceUrls = cluster.articles.map(a => a.sourceUrl);
        await supabase
          .from('news_raw_articles')
          .update({
            status: 'error',
            cluster_id: null,
            processed_at: new Date().toISOString(),
            error_message: String(clusterError),
          })
          .in('source_url', clusterSourceUrls)
          .eq('status', 'processing')
          .eq('cluster_id', runId);
      }
    }

    // Zero clusters + every article skipped almost always means the
    // clusterer (or its upstream API) failed, not that nothing was newsworthy.
    const allFailed = clusters.length === 0
      && clusteringFailed.length > 0
      && skipped.length + clusteringFailed.length + clusteringDeferred.length === rawArticles.length;
    await logPipelineEvent(supabase, {
      runId,
      stage: 'news-process',
      level: allFailed ? 'error' : errors > 0 ? 'warn' : 'info',
      message: allFailed
        ? 'Run finished: zero clusters, clustering failed before editorial relevance checks'
        : 'Run finished',
      meta: {
        rawArticles: rawArticles.length,
        clusters: clusters.length,
        created: postsCreated,
        updated: postsUpdated,
        skipped: skipped.length,
        editorialHeld,
        editorialRejected,
        clusteringFailed: clusteringFailed.length,
        deferred: deferred + clusteringDeferred.length,
        errors,
      },
    });

    return NextResponse.json({
      success: true,
      raw_articles: rawArticles.length,
      clusters: clusters.length,
      posts_created: postsCreated,
      posts_updated: postsUpdated,
      editorial_held: editorialHeld,
      editorial_rejected: editorialRejected,
      clusters_deferred: deferred + clusteringDeferred.length,
      errors,
      elapsed_s: Math.round((Date.now() - startedAt) / 1000),
    });
  } catch (error) {
    console.error('[news-process] Fatal error:', error);
    await logPipelineEvent(supabase, {
      runId,
      stage: 'news-process',
      level: 'error',
      message: `Run failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    // Reset any articles stuck in 'processing' back to 'pending' so they can be retried
    if (articleIds.length > 0) {
      try {
        await supabase
          .from('news_raw_articles')
          .update({ status: 'pending', cluster_id: null, processed_at: null })
          .in('id', articleIds)
          .eq('status', 'processing')
          .eq('cluster_id', runId);
      } catch (resetErr) {
        console.error('[news-process] Failed to reset article status:', resetErr);
      }
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
