/**
 * Translation via the free AI provider chain (local Ollama -> Cloudflare
 * Workers AI -> OpenRouter). Replaces the paid Google Cloud Translation API —
 * the file keeps its name and exports so callers don't change.
 */

import { ContentLocale, CONTENT_LOCALES } from '@/lib/types';
import { aiChatJson } from '@/lib/ai/provider';

export const LOCALE_NAMES: Record<ContentLocale, string> = {
  en: 'English',
  vi: 'Vietnamese',
  ko: 'Korean',
  zh: 'Simplified Chinese',
  ru: 'Russian',
  fr: 'French',
  ja: 'Japanese',
  ms: 'Malay',
  th: 'Thai',
  de: 'German',
  es: 'Spanish',
  id: 'Indonesian',
};

/** How many locales to translate concurrently. The local model queues
 * requests, so higher concurrency only causes timeouts, not speedups. */
const LOCALE_CONCURRENCY = 3;

export const TRANSLATE_SYSTEM =
  'You are a professional translator for dalat.app, a friendly guide to Da Lat, Vietnam. ' +
  'Translate faithfully and naturally. Keep the original tone (warm, casual). ' +
  'Preserve markdown formatting, links, HTML tags, and emoji. ' +
  'Proper nouns (place names, business names, people): use the well-known form in the target language if one exists (e.g. 달랏 for Da Lat in Korean); otherwise KEEP them in their original spelling — never invent a transliteration, mix scripts inside one name, or translate a venue or business name into a literal descriptive phrase. ' +
  'Write as a native speaker would, not word-for-word: use established local terms or loanwords for sports/equipment (e.g. Korean 그래블 바이크 for gravel bike, Japanese タンデム自転車 for tandem bike, Malay kayuhan — never pemanduan — for a bike ride), prefer natural collocations (French en bonne compagnie, not avec de bonne compagnie), and double-check grammatical agreement — gender, case, measure words (Russian "своё воскресное утро", never "свой воскресный утро"). ' +
  'Never add commentary. Never translate URLs or code.';

/**
 * Only sent when the input actually carries ⟦n⟧ tokens. Mentioning tokens on
 * every request made the local model invent them: it replaced venue names with
 * ⟦0⟧, ⟦1⟧ in hundreds of event, moment, and blog translations.
 */
export const TOKEN_INSTRUCTION =
  'Tokens shaped ⟦0⟧ mark a protected proper name. Copy each ⟦n⟧ token through exactly, including the brackets; never translate, transliterate, or omit it.';

const PROTECTED_TOKEN_RE = /⟦\d+⟧/g;

function protectedTokens(text: string): string[] {
  return [...new Set(text.match(PROTECTED_TOKEN_RE) ?? [])].sort();
}

/**
 * A translation is unsafe to store when it contains a ⟦n⟧ token the source did
 * not have (hallucinated) or drops one the source had (lost proper name).
 */
export function translationTokensMismatch(source: string, translated: string): boolean {
  const expected = protectedTokens(source);
  const actual = protectedTokens(translated);
  if (expected.length !== actual.length || expected.some((token, i) => token !== actual[i])) return true;
  // The model also wraps names in the bracket glyphs ("⟦Giang Metta Studio⟧");
  // stray ⟦ or ⟧ the source never had is placeholder syntax leaking into copy.
  return hasStrayBracket(translated) && !hasStrayBracket(source);
}

function hasStrayBracket(text: string): boolean {
  return /[⟦⟧]/.test(text.replace(PROTECTED_TOKEN_RE, ''));
}

/**
 * Detect the language of a text
 */
export async function detectLanguage(
  text: string,
  options?: { timeoutMs?: number },
): Promise<ContentLocale> {
  try {
    const result = await aiChatJson<{ locale: string }>({
      system:
        `Identify the language of the user's text. Respond with JSON {"locale": "xx"} where xx is one of: ${CONTENT_LOCALES.join(', ')}. ` +
        'If the language is not in the list, pick the closest match or "en".',
      prompt: text.slice(0, 500),
      maxTokens: 20,
      temperature: 0,
      timeoutMs: options?.timeoutMs,
    });
    const locale = (result.locale || '').toLowerCase().slice(0, 2);
    return CONTENT_LOCALES.includes(locale as ContentLocale) ? (locale as ContentLocale) : 'en';
  } catch (err) {
    console.warn('[translate] detectLanguage failed, defaulting to en:', err);
    return 'en';
  }
}

/**
 * Translate text to a single target language
 */
export async function translateText(
  text: string,
  targetLocale: ContentLocale
): Promise<string> {
  const result = await translateFieldsToLocale([{ field_name: 'text', text }], targetLocale);
  return result.text ?? text;
}

const MAX_TRANSLATION_TOKENS = 8000;

/**
 * Output tokens per source character, by target script. Thai, CJK and
 * Cyrillic text costs several tokens per character on the free models, so a
 * flat 0.7x budget truncated Thai mid-string and the locale was dropped.
 */
const OUTPUT_TOKENS_PER_CHAR: Partial<Record<ContentLocale, number>> = {
  th: 3,
  ja: 2,
  zh: 2,
  ko: 2,
  ru: 1.5,
  vi: 1.2,
};

export function translationMaxTokens(totalChars: number, targetLocale: ContentLocale): number {
  const perChar = OUTPUT_TOKENS_PER_CHAR[targetLocale] ?? 0.7;
  const floor = perChar > 1 ? 1024 : 512;
  return Math.min(MAX_TRANSLATION_TOKENS, Math.max(floor, Math.ceil(totalChars * perChar)));
}

/** Scripts a translation must contain, so an English echo is not accepted as Thai. */
const LOCALE_SCRIPT: Partial<Record<ContentLocale, RegExp>> = {
  th: /[\u0E00-\u0E7F]/,
  ko: /[\uAC00-\uD7AF]/,
  ja: /[\u3040-\u30FF\u4E00-\u9FFF]/,
  zh: /[\u4E00-\u9FFF]/,
  ru: /[\u0400-\u04FF]/,
};

function usableTranslation(
  fields: { field_name: string; text: string }[],
  parsed: Record<string, string>,
  targetLocale: ContentLocale,
): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const values = fields
    .map((f) => parsed[f.field_name])
    .filter((t): t is string => typeof t === 'string' && t.trim() !== '');
  if (values.length === 0) return false;
  const script = LOCALE_SCRIPT[targetLocale];
  return !script || values.some((t) => script.test(t));
}

function isTruncatedJsonError(err: unknown): boolean {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /SyntaxError|Unterminated|Unexpected end of JSON|not valid JSON|unusable response/i.test(message);
}

/**
 * Translate a set of named fields to one target locale in a single AI call.
 * Returns { field_name: translated_text }.
 * Exported for the Mac mini's incremental per-locale fallback workflow.
 */
export async function translateFieldsToLocale(
  fields: { field_name: string; text: string }[],
  targetLocale: ContentLocale,
  options?: { timeoutMs?: number },
): Promise<Record<string, string>> {
  const input: Record<string, string> = {};
  for (const f of fields) input[f.field_name] = f.text;

  // Long content (blog bodies) needs generous output room and patience on
  // the local model; short fields come back in a few seconds.
  const totalChars = fields.reduce((n, f) => n + f.text.length, 0);
  const maxTokens = translationMaxTokens(totalChars, targetLocale);
  const timeoutMs = options?.timeoutMs ?? (totalChars > 2000 ? 200_000 : 90_000);

  const usesTokens = fields.some((f) => protectedTokens(f.text).length > 0);
  const request = (budget: number) =>
    aiChatJson<Record<string, string>>({
      system: usesTokens ? `${TRANSLATE_SYSTEM} ${TOKEN_INSTRUCTION}` : TRANSLATE_SYSTEM,
      prompt:
        `Translate every value in this JSON object to ${LOCALE_NAMES[targetLocale]}. ` +
        `Return a JSON object with exactly the same keys and only the translated values.\n\n` +
        JSON.stringify(input),
      maxTokens: budget,
      temperature: 0.2,
      timeoutMs,
      validate: (parsed) => usableTranslation(fields, parsed, targetLocale),
    });
  let result: Record<string, string>;
  try {
    result = await request(maxTokens);
  } catch (err) {
    // A response cut off at max_tokens is unparseable JSON ("Unterminated
    // string"). Retry once with double the budget instead of losing the locale.
    if (!isTruncatedJsonError(err) || maxTokens >= MAX_TRANSLATION_TOKENS) throw err;
    result = await request(Math.min(MAX_TRANSLATION_TOKENS, maxTokens * 2));
  }

  // Accept partial results: models occasionally omit a field on long
  // content. Present fields are upserted; coverage tracking retries the
  // missing ones on the next run. Only a fully-empty response is an error.
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const f of fields) {
    const t = result[f.field_name];
    if (typeof t === 'string' && t.trim() && !translationTokensMismatch(f.text, t)) {
      out[f.field_name] = t.trim();
    } else {
      missing.push(f.field_name);
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error(`[translate] empty ${targetLocale} response (fields: ${fields.map((f) => f.field_name).join(', ')})`);
  }
  if (missing.length > 0) {
    console.warn(`[translate] ${targetLocale} response missing: ${missing.join(', ')} — will retry later`);
  }
  return out;
}

/**
 * Map over items with bounded concurrency
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Translate text to all supported content locales
 * Returns a map of locale -> translated text
 */
export async function translateToAllLocales(
  text: string,
  sourceLocale?: ContentLocale
): Promise<{ detectedLocale: ContentLocale; translations: Record<ContentLocale, string> }> {
  const { detectedLocale, translations } = await batchTranslateFields(
    [{ field_name: 'text', text }],
    sourceLocale
  );

  const flat: Record<string, string> = {};
  for (const locale of CONTENT_LOCALES) {
    flat[locale] = translations[locale]?.text ?? text;
  }

  return {
    detectedLocale,
    translations: flat as Record<ContentLocale, string>,
  };
}

/**
 * Batch translate multiple fields to all locales.
 * One AI call per target locale (all fields together). A failed locale is
 * logged and omitted rather than failing the whole batch — callers upsert
 * per-locale rows, so partial coverage self-heals on the next run.
 */
export async function batchTranslateFields(
  fields: { field_name: string; text: string }[],
  sourceLocale?: ContentLocale
): Promise<{
  detectedLocale: ContentLocale;
  translations: Record<ContentLocale, Record<string, string>>;
}> {
  const detectedLocale = sourceLocale || (await detectLanguage(fields[0].text));

  const translations: Record<string, Record<string, string>> = {};

  await mapWithConcurrency(CONTENT_LOCALES.slice(), LOCALE_CONCURRENCY, async (locale) => {
    // Source language needs no translation round-trip
    if (locale === detectedLocale) {
      const same: Record<string, string> = {};
      for (const f of fields) same[f.field_name] = f.text;
      translations[locale] = same;
      return;
    }
    try {
      translations[locale] = await translateFieldsToLocale(fields, locale);
    } catch (err) {
      console.error(`[translate] locale ${locale} failed:`, err);
    }
  });

  return {
    detectedLocale,
    translations: translations as Record<ContentLocale, Record<string, string>>,
  };
}
