import { stripHtml } from './base-scraper';

const TITLE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'the', 'to',
  'cua', 'da', 'dai', 'den', 'duoc', 'la', 'lam', 'lat', 'mot', 'o', 'tai',
  'thanh', 'tinh', 'tren', 'va', 'voi',
]);

function titleWords(title: string): string[] {
  return stripHtml(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
}

function titleTokens(title: string): Set<string> {
  return new Set(titleWords(title)
    .filter(token => token.length >= 2 && !TITLE_STOP_WORDS.has(token)));
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / Math.min(left.size, right.size);
}

const SENSITIVE_TITLE_TERMS = new Set([
  'arrest', 'attack', 'body', 'charged', 'collision', 'crime', 'dead', 'death',
  'died', 'drowning', 'explicit', 'fatal', 'fire', 'flood', 'hospital', 'injured',
  'killed', 'landslide', 'missing', 'murder', 'police', 'storm', 'victim',
  'bao', 'bat', 'benh', 'chet', 'chay', 'cuu', 'nan', 'ngap', 'sat',
  'thuong', 'tich', 'vong', 'xac',
]);

const SENSITIVE_TITLE_PHRASES = [
  'thi the', 'tu vong', 'cong an', 'mat tich', 'hoa hoan', 'tai nan',
];

function titleLooksSensitive(title: string, tokens: Set<string>): boolean {
  const normalizedTitle = titleWords(title).join(' ');
  return [...tokens].some(token => SENSITIVE_TITLE_TERMS.has(token))
    || SENSITIVE_TITLE_PHRASES.some(phrase => normalizedTitle.includes(phrase));
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
  let bestRoutinePair: [number, number] | null = null;
  let bestRoutineScore = 0;

  for (let left = 0; left < candidates.length - 1; left++) {
    for (let right = left + 1; right < candidates.length; right++) {
      const score = overlapScore(tokens[left], tokens[right]);
      if (score > bestScore) {
        bestScore = score;
        bestPair = [left, right];
      }
      if (
        !titleLooksSensitive(candidates[left].title, tokens[left])
        && !titleLooksSensitive(candidates[right].title, tokens[right])
        && score > bestRoutineScore
      ) {
        bestRoutineScore = score;
        bestRoutinePair = [left, right];
      }
    }
  }

  // Routine headlines are often phrased differently by competing newsrooms;
  // two specific shared words are enough to put them in the same bounded pass.
  // The verifier still needs matching accepted facts before publication.
  if (bestRoutinePair && bestRoutineScore >= 0.2) {
    return bestRoutinePair.map(index => candidates[index]);
  }
  if (!bestPair || bestScore < 1 / 3) return candidates.slice(0, maxBatchSize);
  return bestPair.map(index => candidates[index]);
}
