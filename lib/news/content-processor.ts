/**
 * Evidence-first content processor for DaLat News.
 * Raw prose is used only for claim extraction. Published article prose is a
 * deterministic rendering of the accepted ledger, never a model-authored
 * rewrite that can fill gaps with plausible language.
 */

import { aiChat } from '@/lib/ai/provider';
import { slugify } from '@/lib/utils';
import type {
  ArticleCluster,
  NewsContentOutput,
  NewsSourceProvenance,
  VerifiedClaimLedger,
} from './types';
import { buildAcceptedFactFingerprint } from './article-policy';
import {
  NEWS_CLAIM_EXTRACTION_SYSTEM,
  buildClaimExtractionPrompt,
  buildClaimRepairPrompt,
} from './news-prompt';
import { renderVerifiedNews } from './verified-renderer';
import {
  assertGeneratedContentIsSupported,
  buildSourceProvenance,
  buildVerifiedClaimLedger,
  createClaimExtractionSources,
  parseClaimCandidates,
} from './verification';

/** Maximum retries for transient API, malformed JSON, or unsupported output. */
const MAX_RETRIES = 3;
/** Base delay for exponential backoff (ms). */
const BASE_DELAY_MS = 2_000;
const DEFAULT_PROCESSING_BUDGET_MS = 220_000;
const PROVIDER_TIMEOUT_MS = 70_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse JSON from a model response, stripping markdown code fences if present.
 */
function parseJsonResponse(text: string): Record<string, unknown> {
  let jsonText = text.trim();
  if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
  else if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
  if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

  try {
    return JSON.parse(jsonText);
  } catch {
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error(`Failed to parse JSON from response: ${jsonText.slice(0, 200)}...`);
  }
}

async function withRetry<T>(
  stage: string,
  deadlineAt: number,
  operation: () => Promise<T>
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (Date.now() >= deadlineAt) {
      throw new Error(`${stage} exceeded the news-processing deadline`);
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[content-processor] ${stage} retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms: ${lastError.message}`
        );
        const remaining = deadlineAt - Date.now();
        if (remaining <= 0) break;
        await sleep(Math.min(delay, remaining));
      }
    }
  }
  throw lastError ?? new Error(`${stage} failed with an unknown error`);
}

async function extractVerifiedLedger(
  cluster: ArticleCluster,
  processingTime: Date,
  deadlineAt: number
): Promise<{
  ledger: VerifiedClaimLedger;
  sources: ReturnType<typeof createClaimExtractionSources>;
}> {
  const processingTimestamp = processingTime.toISOString();
  const sources = createClaimExtractionSources(cluster.articles, processingTimestamp);

  let prompt = buildClaimExtractionPrompt(sources);
  const bestLedgerRef: { current: VerifiedClaimLedger | null } = { current: null };
  let ledger: VerifiedClaimLedger;

  try {
    ledger = await withRetry('claim extraction', deadlineAt, async () => {
      const responseText = await aiChat({
        system: NEWS_CLAIM_EXTRACTION_SYSTEM,
        prompt,
        json: true,
        maxTokens: 2_500,
        temperature: 0.1,
        timeoutMs: PROVIDER_TIMEOUT_MS,
        deadlineAt,
      });
      const candidates = parseClaimCandidates(parseJsonResponse(responseText));
      if (candidates.length === 0) {
        throw new Error('Claim extractor returned no claim candidates');
      }

      const candidateLedger = buildVerifiedClaimLedger(candidates, sources, processingTime);
      if (
        !bestLedgerRef.current
        || candidateLedger.factGroups.length > bestLedgerRef.current.factGroups.length
        || (
          candidateLedger.factGroups.length === bestLedgerRef.current.factGroups.length
          && candidateLedger.acceptedClaims.length > bestLedgerRef.current.acceptedClaims.length
        )
      ) {
        bestLedgerRef.current = candidateLedger;
      }
      if (candidateLedger.factGroups.length >= 2) return candidateLedger;

      const reasons = candidateLedger.rejectedClaims.map((claim) => claim.reason).join(', ');
      prompt = buildClaimRepairPrompt(sources, candidateLedger.rejectedClaims);
      throw new Error(
        `Claim extractor produced only ${candidateLedger.factGroups.length} supported facts (${reasons || 'no additional candidates'})`
      );
    });
  } catch (error) {
    // A sparse but valid ledger remains useful for the normal corroboration or
    // official-source path. The routine single-newsroom exception still needs
    // two high-confidence facts and therefore cannot be reached through this fallback.
    if (bestLedgerRef.current && bestLedgerRef.current.acceptedClaims.length > 0) {
      ledger = bestLedgerRef.current;
    }
    else throw error;
  }

  return { ledger, sources };
}

export interface VerifiedNewsEvidence {
  verification: VerifiedClaimLedger;
  sourceUrls: NewsSourceProvenance[];
  acceptedFactFingerprint: string;
}

/**
 * Verify raw reporting and compute the stable factual revision before any
 * rendering. Existing articles can stop here when their accepted facts are
 * unchanged, preserving their edited copy and SEO metadata byte-for-byte.
 */
export async function verifyNewsCluster(
  cluster: ArticleCluster,
  deadlineAt: number = Date.now() + DEFAULT_PROCESSING_BUDGET_MS
): Promise<VerifiedNewsEvidence> {
  if (cluster.articles.length === 0) {
    throw new Error('Cannot process an empty news cluster');
  }

  const processingTime = new Date();
  const { ledger, sources } = await extractVerifiedLedger(cluster, processingTime, deadlineAt);
  const acceptedFactFingerprint = await buildAcceptedFactFingerprint(ledger.factGroups);

  return {
    verification: ledger,
    sourceUrls: buildSourceProvenance(sources, ledger, acceptedFactFingerprint),
    acceptedFactFingerprint,
  };
}

/**
 * Render a concise fact bulletin from an already verified fact ledger. This is
 * deliberately not another AI call: fixed key labels plus accepted values are
 * the fail-closed control for causes, intentions, cancellations, amenities,
 * popularity, and other ordinary-word hallucinations.
 */
export async function generateNewsContent(
  cluster: ArticleCluster,
  evidence: VerifiedNewsEvidence,
  deadlineAt: number = Date.now() + DEFAULT_PROCESSING_BUDGET_MS
): Promise<NewsContentOutput> {
  const ledger = evidence.verification;
  if (Date.now() >= deadlineAt) {
    throw new Error('verified rendering exceeded the news-processing deadline');
  }
  const rendered = renderVerifiedNews(ledger);
  assertGeneratedContentIsSupported({
    title: rendered.title,
    storyContent: rendered.storyContent,
    technicalContent: rendered.technicalContent,
    metaDescription: rendered.metaDescription,
    additionalText: [rendered.newsTopic],
  }, ledger);

  const factualKeywords = [
    'Da Lat news',
    ...ledger.factGroups
      .filter((fact) => !/(^|\.)quote(\.|$)/u.test(fact.normalizedKey))
      .map((fact) => fact.value),
  ].filter((value, index, values) =>
    value.length >= 2 && value.length <= 60 && values.indexOf(value) === index
  ).slice(0, 10);

  return {
    title: rendered.title,
    storyContent: rendered.storyContent,
    technicalContent: rendered.technicalContent,
    metaDescription: rendered.metaDescription,
    seoKeywords: factualKeywords,
    suggestedSlug: slugify(rendered.title).slice(0, 80).replace(/-$/u, '') || 'dalat-news',
    newsTags: rendered.newsTags,
    newsTopic: rendered.newsTopic,
    imageDescriptions: [],
    sourceUrls: evidence.sourceUrls,
    internalLinks: [],
    verification: ledger,
    qualityFactors: {
      sourceCount: new Set(ledger.acceptedClaims.map((claim) => claim.sourceUrl)).size,
      hasDates: ledger.acceptedClaims.some((claim) => claim.publishedAt !== null),
      hasNamedSources: ledger.acceptedClaims.length > 0,
      hasImages: cluster.articles.some((article) => article.imageUrls.length > 0),
      contentLength: rendered.storyContent.length,
      dalatRelevance: 0.8,
    },
  };
}

/** Compatibility wrapper for callers that always need a fresh article. */
export async function processNewsCluster(
  cluster: ArticleCluster,
  deadlineAt: number = Date.now() + DEFAULT_PROCESSING_BUDGET_MS
): Promise<NewsContentOutput> {
  const evidence = await verifyNewsCluster(cluster, deadlineAt);
  return generateNewsContent(cluster, evidence, deadlineAt);
}
