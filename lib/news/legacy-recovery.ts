import { getSourceByArticleUrl } from './sources';

export const LEGACY_RECOVERY_BATCH_SIZE = 3;
export const LEGACY_RECOVERY_URL_LIMIT = 6;

export interface LegacyAutomatedPost {
  id: string;
  slug: string;
  source_urls: unknown;
}

export interface LegacyRecoveryCandidate {
  blogPostId: string;
  slug: string;
  sourceId: string;
  sourceUrl: string;
}

export interface LegacyRecoveryAudit {
  unlinkedPosts: number;
  sourceFreePosts: number;
  sourceBackedPosts: number;
  registeredSourceUrls: number;
  unregisteredSourceUrls: number;
  ambiguousSourceUrls: number;
  candidates: LegacyRecoveryCandidate[];
}

export function storedSourceUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls = value.flatMap((source) => {
    if (typeof source === 'string') return [source];
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return [];
    const url = (source as Record<string, unknown>).url;
    return typeof url === 'string' ? [url] : [];
  });
  return [...new Set(urls)];
}

/**
 * Classify legacy public automation that predates raw-article identity links.
 * Recoverable entries remain keyed to their existing post ID and slug; no new
 * public URL is minted. Source-free rows stay explicit manual-audit work.
 */
export function auditLegacyRecovery(
  posts: LegacyAutomatedPost[],
  linkedSourceUrlsByPost: ReadonlyMap<string, ReadonlySet<string>>,
  batchSize: number = LEGACY_RECOVERY_BATCH_SIZE,
  urlLimit: number = LEGACY_RECOVERY_URL_LIMIT
): LegacyRecoveryAudit {
  const audit: LegacyRecoveryAudit = {
    unlinkedPosts: 0,
    sourceFreePosts: 0,
    sourceBackedPosts: 0,
    registeredSourceUrls: 0,
    unregisteredSourceUrls: 0,
    ambiguousSourceUrls: 0,
    candidates: [],
  };
  const ownersByUrl = new Map<string, Set<string>>();
  for (const post of posts) {
    for (const sourceUrl of storedSourceUrls(post.source_urls)) {
      const owners = ownersByUrl.get(sourceUrl) ?? new Set<string>();
      owners.add(post.id);
      ownersByUrl.set(sourceUrl, owners);
    }
  }
  const reportedAmbiguousUrls = new Set<string>();
  let selectedPosts = 0;

  for (const post of posts) {
    const urls = storedSourceUrls(post.source_urls);
    const linkedUrls = linkedSourceUrlsByPost.get(post.id) ?? new Set<string>();
    const missingUrls = urls.filter((url) => !linkedUrls.has(url));
    if (urls.length > 0 && missingUrls.length === 0) continue;
    if (urls.length === 0 && linkedUrls.size > 0) continue;

    audit.unlinkedPosts++;
    if (urls.length === 0) {
      audit.sourceFreePosts++;
      continue;
    }
    audit.sourceBackedPosts++;
    const recoverableForPost: LegacyRecoveryCandidate[] = [];

    for (const sourceUrl of missingUrls) {
      const source = getSourceByArticleUrl(sourceUrl);
      if (!source) {
        audit.unregisteredSourceUrls++;
        continue;
      }
      audit.registeredSourceUrls++;
      if ((ownersByUrl.get(sourceUrl)?.size ?? 0) > 1) {
        if (!reportedAmbiguousUrls.has(sourceUrl)) {
          audit.ambiguousSourceUrls++;
          reportedAmbiguousUrls.add(sourceUrl);
        }
        continue;
      }
      recoverableForPost.push({
        blogPostId: post.id,
        slug: post.slug,
        sourceId: source.id,
        sourceUrl,
      });
    }
    // Attempts are globally bounded. Every success or failure becomes a
    // durable link, so later runs advance through any remaining corroboration
    // without repeatedly spending the first slot on one dead URL.
    if (
      recoverableForPost.length > 0
      && selectedPosts < batchSize
      && audit.candidates.length < urlLimit
    ) {
      audit.candidates.push(
        ...recoverableForPost.slice(0, urlLimit - audit.candidates.length)
      );
      selectedPosts++;
    }
  }

  return audit;
}
