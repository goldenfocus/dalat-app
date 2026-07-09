/**
 * Translation via the free AI provider chain (local Ollama -> Cloudflare
 * Workers AI -> OpenRouter). Replaces the paid Google Cloud Translation API —
 * the file keeps its name and exports so callers don't change.
 */

import { ContentLocale, CONTENT_LOCALES } from '@/lib/types';
import { aiChatJson } from '@/lib/ai/provider';

const LOCALE_NAMES: Record<ContentLocale, string> = {
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

const TRANSLATE_SYSTEM =
  'You are a professional translator for dalat.app, a friendly guide to Da Lat, Vietnam. ' +
  'Translate faithfully and naturally. Keep the original tone (warm, casual). ' +
  'Preserve markdown formatting, links, HTML tags, and emoji. ' +
  'Proper nouns (place names, business names, people): use the well-known form in the target language if one exists (e.g. 달랏 for Da Lat in Korean); otherwise KEEP them in their original Latin script — never invent a transliteration or mix scripts inside one name. ' +
  'Never add commentary. Never translate URLs or code.';

/**
 * Detect the language of a text
 */
export async function detectLanguage(text: string): Promise<ContentLocale> {
  try {
    const result = await aiChatJson<{ locale: string }>({
      system:
        `Identify the language of the user's text. Respond with JSON {"locale": "xx"} where xx is one of: ${CONTENT_LOCALES.join(', ')}. ` +
        'If the language is not in the list, pick the closest match or "en".',
      prompt: text.slice(0, 500),
      maxTokens: 20,
      temperature: 0,
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

/**
 * Translate a set of named fields to one target locale in a single AI call.
 * Returns { field_name: translated_text }.
 * Exported for incremental per-locale workflows (translate-pending cron).
 */
export async function translateFieldsToLocale(
  fields: { field_name: string; text: string }[],
  targetLocale: ContentLocale
): Promise<Record<string, string>> {
  const input: Record<string, string> = {};
  for (const f of fields) input[f.field_name] = f.text;

  // Long content (blog bodies) needs generous output room and patience on
  // the local model; short fields come back in a few seconds.
  const totalChars = fields.reduce((n, f) => n + f.text.length, 0);
  const maxTokens = Math.min(8000, Math.max(512, Math.ceil(totalChars * 0.7)));
  const timeoutMs = totalChars > 2000 ? 200_000 : 90_000;

  const result = await aiChatJson<Record<string, string>>({
    system: TRANSLATE_SYSTEM,
    prompt:
      `Translate every value in this JSON object to ${LOCALE_NAMES[targetLocale]}. ` +
      `Return a JSON object with exactly the same keys and only the translated values.\n\n` +
      JSON.stringify(input),
    maxTokens,
    temperature: 0.2,
    timeoutMs,
  });

  // Guard: the model must return every field, non-empty
  const out: Record<string, string> = {};
  for (const f of fields) {
    const t = result[f.field_name];
    if (typeof t !== 'string' || !t.trim()) {
      throw new Error(`[translate] missing field "${f.field_name}" in ${targetLocale} response`);
    }
    out[f.field_name] = t.trim();
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
