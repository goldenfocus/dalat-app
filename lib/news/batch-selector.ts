import { stripHtml } from './base-scraper';

const TITLE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'the', 'to',
  'cua', 'da', 'dai', 'den', 'duoc', 'la', 'lam', 'lat', 'mot', 'o', 'tai',
  'thanh', 'tinh', 'tren', 'va', 'voi',
]);

function titleTokens(title: string): Set<string> {
  return new Set(stripHtml(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter(token => token.length >= 2 && !TITLE_STOP_WORDS.has(token)) ?? []);
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / Math.min(left.size, right.size);
}

/**
 * Choose a bounded processing batch while preferring two headlines likely to
 * describe the same event. Verification still requires matching accepted facts
 * from independent registered publishers; this only avoids separating obvious
 * corroboration across different cron runs.
 */
export function selectNewsProcessingBatch<T extends { title: string }>(
  candidates: T[],
  maxBatchSize = 2,
): T[] {
  if (candidates.length <= maxBatchSize) return candidates;
  if (maxBatchSize < 2) return candidates.slice(0, Math.max(0, maxBatchSize));

  const tokens = candidates.map(candidate => titleTokens(candidate.title));
  let bestPair: [number, number] | null = null;
  let bestScore = 0;

  for (let left = 0; left < candidates.length - 1; left++) {
    for (let right = left + 1; right < candidates.length; right++) {
      const score = overlapScore(tokens[left], tokens[right]);
      if (score > bestScore) {
        bestScore = score;
        bestPair = [left, right];
      }
    }
  }

  if (!bestPair || bestScore < 1 / 3) return candidates.slice(0, maxBatchSize);
  return bestPair.map(index => candidates[index]);
}
