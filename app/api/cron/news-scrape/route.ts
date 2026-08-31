import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ALL_SCRAPERS } from '@/lib/news/processors';
import { scrapeKnownArticle } from '@/lib/news/base-scraper';
import {
  LINKED_SOURCE_REVERIFY_AFTER_MS,
  LINKED_SOURCE_REVERIFY_BATCH_SIZE,
  buildReverificationFailureUpdate,
  buildReverificationSuccessUpdate,
} from '@/lib/news/reverification';
import {
  auditLegacyRecovery,
  type LegacyAutomatedPost,
  type LegacyRecoveryCandidate,
} from '@/lib/news/legacy-recovery';
import { getSourceById } from '@/lib/news/sources';
import type { ScrapedArticle } from '@/lib/news/types';
import {
  evaluateNewsFreshness,
  freshnessQueueStatus,
} from '@/lib/news/freshness-policy';

// Lazy init
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const maxDuration = 300; // 5 min timeout
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const REVERIFY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sameStringArray(a: string[] | null, b: string[]): boolean {
  const left = [...(a ?? [])].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

interface ReverificationStats {
  selected: number;
  refreshed: number;
  failed: number;
  errors: number;
}

interface LegacyRecoveryStats {
  unlinkedPosts: number;
  sourceFreePosts: number;
  sourceBackedPosts: number;
  registeredSourceUrls: number;
  unregisteredSourceUrls: number;
  ambiguousSourceUrls: number;
  selected: number;
  attempted: number;
  deferred: number;
  recovered: number;
  failed: number;
  conflicts: number;
  errors: number;
}

type NewsSupabaseClient = ReturnType<typeof getSupabase>;
const LEGACY_CLAIM_STALE_MS = 15 * 60 * 1000;
const LEGACY_RECOVERY_DEADLINE_MS = 60_000;
const LEGACY_INVENTORY_PAGE_SIZE = 1000;

interface LegacyLinkInventoryRow {
  blog_post_id: string | null;
  source_url: string;
  status: string;
  error_message: string | null;
  processed_at: string | null;
}

interface ClaimedLegacySource {
  rawId: string;
  token: string;
  previousPublishedAt: string | null;
  previousImageUrls: string[];
}

async function runLinkedReverification(
  supabase: NewsSupabaseClient,
  stats: ReverificationStats
): Promise<void> {
  const staleBefore = new Date(Date.now() - LINKED_SOURCE_REVERIFY_AFTER_MS).toISOString();
  const { data: linkedRows, error: linkedRowsError } = await supabase
    .from('news_raw_articles')
    .select('id, source_id, source_url, published_at, image_urls')
    .eq('status', 'processed')
    .not('blog_post_id', 'is', null)
    .or(`processed_at.is.null,processed_at.lt.${staleBefore}`)
    .order('processed_at', { ascending: true, nullsFirst: true })
    .order('scraped_at', { ascending: true })
    .limit(LINKED_SOURCE_REVERIFY_BATCH_SIZE);

  if (linkedRowsError) {
    stats.errors++;
    console.error('[news-scrape] Failed to load linked rows for reverification:', linkedRowsError);
    return;
  }

  stats.selected = linkedRows?.length ?? 0;
  for (const row of linkedRows ?? []) {
    const attemptedAt = new Date().toISOString();
    try {
      const article = await scrapeKnownArticle(row.source_id, row.source_url);
      if (article) {
        const { data: refreshedRows, error: refreshError } = await supabase
          .from('news_raw_articles')
          .update(buildReverificationSuccessUpdate(
            article,
            attemptedAt,
            row.published_at ?? null,
            row.image_urls ?? []
          ))
          .eq('id', row.id)
          .eq('status', 'processed')
          .select('id');

        if (refreshError || refreshedRows?.length !== 1) {
          stats.errors++;
          console.error(
            `[news-scrape] Reverification refresh CAS lost for ${row.id}:`,
            refreshError ?? `expected one row, updated ${refreshedRows?.length ?? 0}`
          );
        } else {
          stats.refreshed++;
        }
        continue;
      }

      const { data: failedRows, error: failureUpdateError } = await supabase
        .from('news_raw_articles')
        .update(buildReverificationFailureUpdate(attemptedAt, 'fetch or parse failed'))
        .eq('id', row.id)
        .eq('status', 'processed')
        .select('id');
      if (failureUpdateError || failedRows?.length !== 1) {
        stats.errors++;
        console.error(
          `[news-scrape] Reverification failure CAS lost for ${row.id}:`,
          failureUpdateError ?? `expected one row, updated ${failedRows?.length ?? 0}`
        );
      } else {
        stats.failed++;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const { data: failedRows, error: failureUpdateError } = await supabase
        .from('news_raw_articles')
        .update(buildReverificationFailureUpdate(attemptedAt, reason))
        .eq('id', row.id)
        .eq('status', 'processed')
        .select('id');
      if (failureUpdateError || failedRows?.length !== 1) {
        stats.errors++;
        console.error(
          `[news-scrape] Reverification error CAS lost for ${row.id}:`,
          error,
          failureUpdateError ?? `expected one row, updated ${failedRows?.length ?? 0}`
        );
      } else {
        stats.failed++;
      }
    }
  }
}

async function completeClaimedLegacyRecovery(
  supabase: NewsSupabaseClient,
  candidate: LegacyRecoveryCandidate,
  claim: ClaimedLegacySource,
  stats: LegacyRecoveryStats
): Promise<void> {
  const attemptedAt = new Date().toISOString();
  let article: ScrapedArticle | null = null;
  let failureReason = 'fetch, redirect, canonical, or parse validation failed';
  try {
    article = await scrapeKnownArticle(candidate.sourceId, candidate.sourceUrl);
  } catch (error) {
    failureReason = error instanceof Error ? error.message : String(error);
  }

  if (!article) {
    // Persist the attempt as a linked processed row. The ordinary 30-day
    // linked-source sweep will retry it later, while the legacy inventory can
    // advance past this permanently dead URL on the very next run.
    const { data: failedRows, error: failureError } = await supabase
      .from('news_raw_articles')
      .update(buildReverificationFailureUpdate(attemptedAt, failureReason))
      .eq('id', claim.rawId)
      .eq('status', 'error')
      .eq('error_message', claim.token)
      .eq('blog_post_id', candidate.blogPostId)
      .select('id');
    if (failureError || failedRows?.length !== 1) {
      stats.errors++;
      console.error(
        `[news-scrape] Legacy failure CAS lost for ${candidate.slug}:`,
        failureError ?? `expected one row, updated ${failedRows?.length ?? 0}`
      );
    } else {
      stats.failed++;
    }
    return;
  }

  const update = {
    ...buildReverificationSuccessUpdate(
      article,
      attemptedAt,
      claim.previousPublishedAt,
      claim.previousImageUrls
    ),
    blog_post_id: candidate.blogPostId,
  };
  const { data: recoveredRows, error: recoveryError } = await supabase
    .from('news_raw_articles')
    .update(update)
    .eq('id', claim.rawId)
    .eq('status', 'error')
    .eq('error_message', claim.token)
    .eq('blog_post_id', candidate.blogPostId)
    .select('id');
  if (recoveryError || recoveredRows?.length !== 1) {
    stats.errors++;
    console.error(
      `[news-scrape] Legacy recovery CAS lost for ${candidate.slug}:`,
      recoveryError ?? `expected one row, updated ${recoveredRows?.length ?? 0}`
    );
  } else {
    stats.recovered++;
  }
}

async function runLegacyRecovery(
  supabase: NewsSupabaseClient,
  stats: LegacyRecoveryStats
): Promise<void> {
  const posts: LegacyAutomatedPost[] = [];
  const links: LegacyLinkInventoryRow[] = [];
  for (let from = 0; ; from += LEGACY_INVENTORY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, slug, source_urls')
      .eq('source', 'news_scrape')
      .in('status', ['published', 'experimental'])
      .order('id', { ascending: true })
      .range(from, from + LEGACY_INVENTORY_PAGE_SIZE - 1);
    if (error) {
      stats.errors++;
      console.error('[news-scrape] Legacy post inventory failed:', error);
      return;
    }
    posts.push(...((data ?? []) as LegacyAutomatedPost[]));
    if ((data?.length ?? 0) < LEGACY_INVENTORY_PAGE_SIZE) break;
  }
  for (let from = 0; ; from += LEGACY_INVENTORY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('news_raw_articles')
      .select('id, blog_post_id, source_url, status, error_message, processed_at')
      .not('blog_post_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + LEGACY_INVENTORY_PAGE_SIZE - 1);
    if (error) {
      stats.errors++;
      console.error('[news-scrape] Legacy source-link inventory failed:', error);
      return;
    }
    links.push(...((data ?? []) as LegacyLinkInventoryRow[]));
    if ((data?.length ?? 0) < LEGACY_INVENTORY_PAGE_SIZE) break;
  }

  const linkedSourceUrlsByPost = new Map<string, Set<string>>();
  for (const row of links) {
    if (typeof row.blog_post_id !== 'string' || typeof row.source_url !== 'string') continue;
    const claimTime = typeof row.processed_at === 'string' ? Date.parse(row.processed_at) : NaN;
    const isStaleAbandonedClaim = row.status === 'error'
      && typeof row.error_message === 'string'
      && row.error_message.startsWith('[legacy-recovery:claim:')
      && (!Number.isFinite(claimTime) || Date.now() - claimTime >= LEGACY_CLAIM_STALE_MS);
    if (isStaleAbandonedClaim) continue;
    const urls = linkedSourceUrlsByPost.get(row.blog_post_id) ?? new Set<string>();
    urls.add(row.source_url);
    linkedSourceUrlsByPost.set(row.blog_post_id, urls);
  }
  const audit = auditLegacyRecovery(posts, linkedSourceUrlsByPost);
  stats.unlinkedPosts = audit.unlinkedPosts;
  stats.sourceFreePosts = audit.sourceFreePosts;
  stats.sourceBackedPosts = audit.sourceBackedPosts;
  stats.registeredSourceUrls = audit.registeredSourceUrls;
  stats.unregisteredSourceUrls = audit.unregisteredSourceUrls;
  stats.ambiguousSourceUrls = audit.ambiguousSourceUrls;
  stats.selected = audit.candidates.length;

  if (audit.sourceFreePosts > 0 || audit.unregisteredSourceUrls > 0) {
    console.warn(
      `[news-scrape] Legacy audit: ${audit.sourceFreePosts} source-free posts and ${audit.unregisteredSourceUrls} unregistered source URLs require editorial sourcing`
    );
  }
  if (audit.ambiguousSourceUrls > 0) {
    console.error(
      `[news-scrape] Quarantined ${audit.ambiguousSourceUrls} source URLs claimed by multiple public posts`
    );
  }

  const deadlineAt = Date.now() + LEGACY_RECOVERY_DEADLINE_MS;
  for (const candidate of audit.candidates) {
    if (Date.now() >= deadlineAt) {
      stats.deferred = audit.candidates.length - stats.attempted;
      break;
    }
    stats.attempted++;
    const attemptedAt = new Date().toISOString();
    const { data: existingRaw, error: lookupError } = await supabase
      .from('news_raw_articles')
      .select('id, blog_post_id, status, error_message, published_at, image_urls')
      .eq('source_url', candidate.sourceUrl)
      .maybeSingle();
    if (lookupError) {
      stats.errors++;
      console.error(`[news-scrape] Legacy source lookup failed for ${candidate.slug}:`, lookupError);
      continue;
    }
    if (existingRaw?.blog_post_id && existingRaw.blog_post_id !== candidate.blogPostId) {
      stats.conflicts++;
      console.error(`[news-scrape] Legacy source already belongs to another post: ${candidate.sourceUrl}`);
      continue;
    }

    // A pending discovery row has not been leased yet. Atomically add only the
    // canonical post identity; never mutate an active processing lease.
    if (existingRaw?.status === 'pending') {
      let attachQuery = supabase
        .from('news_raw_articles')
        .update({ blog_post_id: candidate.blogPostId })
        .eq('id', existingRaw.id)
        .eq('status', 'pending');
      attachQuery = existingRaw.blog_post_id
        ? attachQuery.eq('blog_post_id', existingRaw.blog_post_id)
        : attachQuery.is('blog_post_id', null);
      const { data: attachedRows, error: attachError } = await attachQuery.select('id');
      if (attachError || attachedRows?.length !== 1) {
        stats.conflicts++;
        console.error(
          `[news-scrape] Legacy pending-row CAS lost for ${candidate.slug}:`,
          attachError ?? `expected one row, updated ${attachedRows?.length ?? 0}`
        );
      } else {
        stats.recovered++;
      }
      continue;
    }
    if (existingRaw?.status === 'processing') {
      stats.conflicts++;
      continue;
    }

    const token = `[legacy-recovery:claim:${crypto.randomUUID()}]`;
    let claimed: ClaimedLegacySource | null = null;
    if (existingRaw) {
      let claimQuery = supabase
        .from('news_raw_articles')
        .update({
          status: 'error',
          error_message: token,
          processed_at: attemptedAt,
          blog_post_id: candidate.blogPostId,
        })
        .eq('id', existingRaw.id)
        .eq('status', existingRaw.status);
      claimQuery = existingRaw.blog_post_id
        ? claimQuery.eq('blog_post_id', existingRaw.blog_post_id)
        : claimQuery.is('blog_post_id', null);
      claimQuery = existingRaw.error_message
        ? claimQuery.eq('error_message', existingRaw.error_message)
        : claimQuery.is('error_message', null);
      const { data: claimedRows, error: claimError } = await claimQuery.select('id');
      if (claimError || claimedRows?.length !== 1) {
        stats.conflicts++;
        console.error(
          `[news-scrape] Legacy claim CAS lost for ${candidate.slug}:`,
          claimError ?? `expected one row, updated ${claimedRows?.length ?? 0}`
        );
        continue;
      }
      claimed = {
        rawId: existingRaw.id,
        token,
        previousPublishedAt: existingRaw.published_at ?? null,
        previousImageUrls: existingRaw.image_urls ?? [],
      };
    } else {
      const source = getSourceById(candidate.sourceId);
      const { data: insertedRows, error: insertError } = await supabase
        .from('news_raw_articles')
        .insert({
          source_id: candidate.sourceId,
          source_url: candidate.sourceUrl,
          source_name: source?.name ?? candidate.sourceId,
          title: `Legacy source recovery for ${candidate.slug}`,
          content: '',
          image_urls: [],
          status: 'error',
          blog_post_id: candidate.blogPostId,
          processed_at: attemptedAt,
          error_message: token,
        })
        .select('id');
      if (insertError || insertedRows?.length !== 1) {
        if (insertError?.code === '23505') stats.conflicts++;
        else stats.errors++;
        console.error(
          `[news-scrape] Legacy reservation failed for ${candidate.slug}:`,
          insertError ?? `expected one row, inserted ${insertedRows?.length ?? 0}`
        );
        continue;
      }
      claimed = {
        rawId: insertedRows[0].id,
        token,
        previousPublishedAt: null,
        previousImageUrls: [],
      };
    }

    await completeClaimedLegacyRecovery(supabase, candidate, claimed, stats);
  }
}

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
  const results: Record<string, {
    scraped: number;
    new: number;
    refreshed: number;
    heldForReview: number;
    quarantinedHistorical: number;
    skipped: number;
    errors: number;
  }> = {};
  let totalNew = 0;
  const reverification = {
    selected: 0,
    refreshed: 0,
    failed: 0,
    errors: 0,
  };
  const legacyRecovery: LegacyRecoveryStats = {
    unlinkedPosts: 0,
    sourceFreePosts: 0,
    sourceBackedPosts: 0,
    registeredSourceUrls: 0,
    unregisteredSourceUrls: 0,
    ambiguousSourceUrls: 0,
    selected: 0,
    attempted: 0,
    deferred: 0,
    recovered: 0,
    failed: 0,
    conflicts: 0,
    errors: 0,
  };

  try {
    // SEO-preserving correction work gets the first, bounded slice of runtime.
    // Discovery can be large or slow; it must never starve established URLs.
    await runLegacyRecovery(supabase, legacyRecovery);
    await runLinkedReverification(supabase, reverification);

    // Run each scraper sequentially (be respectful to news sites)
    for (const { id, name, scrape } of ALL_SCRAPERS) {
      console.log(`[news-scrape] Starting ${name}...`);
      const sourceResult = {
        scraped: 0,
        new: 0,
        refreshed: 0,
        heldForReview: 0,
        quarantinedHistorical: 0,
        skipped: 0,
        errors: 0,
      };

      try {
        const articles: ScrapedArticle[] = await scrape();
        sourceResult.scraped = articles.length;

        for (const article of articles) {
          // A known URL is not a disposable duplicate. Re-fetch it, compare the
          // source snapshot, and periodically requeue it so the established
          // DaLat.app URL can be corrected in place.
          const { data: existing } = await supabase
            .from('news_raw_articles')
            .select('id, title, content, image_urls, published_at, scraped_at, status, error_message, blog_post_id')
            .eq('source_url', article.sourceUrl)
            .maybeSingle();

          if (existing) {
            const sourcePublishedAt = article.publishedAt ?? existing.published_at ?? null;
            const freshness = evaluateNewsFreshness(sourcePublishedAt);
            const queueStatus = existing.blog_post_id
              ? 'pending'
              : freshnessQueueStatus(freshness);
            const changed =
              normalizeText(existing.title) !== normalizeText(article.title) ||
              normalizeText(existing.content) !== normalizeText(article.content) ||
              (article.imageUrls.length > 0 && !sameStringArray(existing.image_urls, article.imageUrls)) ||
              (article.publishedAt !== null && existing.published_at !== article.publishedAt);
            const retrievedAt = new Date(existing.scraped_at).getTime();
            const dueForReverification =
              !Number.isFinite(retrievedAt) || Date.now() - retrievedAt >= REVERIFY_AFTER_MS;

            if (!changed && !dueForReverification) {
              sourceResult.skipped++;
              continue;
            }

            // Avoid racing the processing job if a manual invocation overlaps.
            if (existing.status === 'processing') {
              sourceResult.skipped++;
              continue;
            }

            let refreshQuery = supabase
              .from('news_raw_articles')
              .update({
                source_id: article.sourceId,
                source_name: article.sourceName,
                title: article.title,
                content: article.content,
                image_urls: article.imageUrls.length > 0
                  ? article.imageUrls
                  : (existing.image_urls ?? []),
                published_at: sourcePublishedAt,
                scraped_at: new Date().toISOString(),
                processed_at: queueStatus === 'pending' ? null : new Date().toISOString(),
                status: queueStatus,
                error_message: null,
                editorial_disposition: existing.blog_post_id ? 'update' : freshness.disposition,
                editorial_review_reason: existing.blog_post_id
                  ? 'Established URL queued for in-place reverification'
                  : freshness.reason,
                editorial_reviewed_at: new Date().toISOString(),
              })
              .eq('id', existing.id)
              .eq('status', existing.status);
            refreshQuery = existing.error_message
              ? refreshQuery.eq('error_message', existing.error_message)
              : refreshQuery.is('error_message', null);
            const { data: refreshedRows, error: refreshError } = await refreshQuery.select('id');

            if (refreshError || refreshedRows?.length !== 1) {
              console.error(
                `[news-scrape] Refresh CAS lost for ${article.sourceUrl}:`,
                refreshError ?? `expected one row, updated ${refreshedRows?.length ?? 0}`
              );
              sourceResult.skipped++;
            } else {
              sourceResult.refreshed++;
              if (queueStatus === 'review') sourceResult.heldForReview++;
              if (queueStatus === 'skipped') sourceResult.quarantinedHistorical++;
            }
            continue;
          }

          // Insert new article. Only genuinely fresh reporting enters the
          // processor; ambiguous dates wait for an editor and historical pages
          // are quarantined without spending generation capacity.
          const freshness = evaluateNewsFreshness(article.publishedAt);
          const queueStatus = freshnessQueueStatus(freshness);
          const { error: insertError } = await supabase
            .from('news_raw_articles')
            .insert({
              source_id: article.sourceId,
              source_url: article.sourceUrl,
              source_name: article.sourceName,
              title: article.title,
              content: article.content,
              image_urls: article.imageUrls,
              published_at: article.publishedAt,
              status: queueStatus,
              processed_at: queueStatus === 'pending' ? null : new Date().toISOString(),
              editorial_disposition: freshness.disposition,
              editorial_review_reason: freshness.reason,
              editorial_reviewed_at: new Date().toISOString(),
            });

          if (insertError) {
            // Unique constraint violation = concurrent duplicate, count as skipped not error
            if (insertError.code === '23505') {
              sourceResult.skipped++;
            } else {
              console.error(`[news-scrape] Insert error for ${article.sourceUrl}:`, insertError);
              sourceResult.errors++;
            }
          } else {
            if (queueStatus === 'pending') {
              sourceResult.new++;
              totalNew++;
            } else if (queueStatus === 'review') {
              sourceResult.heldForReview++;
            } else {
              sourceResult.quarantinedHistorical++;
            }
          }
        }
      } catch (error) {
        console.error(`[news-scrape] ${name} scraper failed:`, error);
        sourceResult.errors++;
      }

      results[id] = sourceResult;
      console.log(`[news-scrape] ${name}: scraped=${sourceResult.scraped}, fresh=${sourceResult.new}, review=${sourceResult.heldForReview}, historical=${sourceResult.quarantinedHistorical}, refreshed=${sourceResult.refreshed}, skipped=${sourceResult.skipped}, errors=${sourceResult.errors}`);
    }

    return NextResponse.json({
      success: true,
      total_new: totalNew,
      sources: results,
      reverification,
      legacy_recovery: legacyRecovery,
    });
  } catch (error) {
    console.error('[news-scrape] Fatal error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
