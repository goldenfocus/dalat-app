import { ContentLocale, CONTENT_LOCALES } from '@/lib/types';

const GOOGLE_TRANSLATE_API = 'https://translation.googleapis.com/language/translate/v2';

interface GoogleTranslateResponse {
  data: {
    translations: {
      translatedText: string;
      detectedSourceLanguage?: string;
    }[];
  };
}

interface GoogleDetectResponse {
  data: {
    detections: {
      language: string;
      confidence: number;
    }[][];
  };
}

/**
 * Detect the language of a text using Google Translate API
 */
export async function detectLanguage(text: string): Promise<ContentLocale> {
  const apiKey = process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_CLOUD_TRANSLATION_API_KEY is not configured');
  }

  const response = await fetch(`${GOOGLE_TRANSLATE_API}/detect?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Translate detect failed: ${error}`);
  }

  const result: GoogleDetectResponse = await response.json();
  const detected = result.data.detections[0]?.[0]?.language || 'en';

  // Map Google's language codes to our content locales
  const mappedLocale = mapToContentLocale(detected);
  return mappedLocale;
}

/**
 * Translate text to a single target language
 */
export async function translateText(
  text: string,
  targetLocale: ContentLocale
): Promise<string> {
  const apiKey = process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_CLOUD_TRANSLATION_API_KEY is not configured');
  }

  // Never pass `source` — let Google auto-detect per translation call.
  // Forcing a source language (especially a misdetected one) produces garbage.
  const params: Record<string, string> = {
    q: text,
    target: mapToGoogleCode(targetLocale),
    format: 'text',
  };

  const response = await fetch(`${GOOGLE_TRANSLATE_API}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Translate failed: ${error}`);
  }

  const result: GoogleTranslateResponse = await response.json();
  return result.data.translations[0].translatedText;
}

/**
 * Translate text to all supported content locales
 * Returns a map of locale -> translated text
 */
export async function translateToAllLocales(
  text: string,
  sourceLocale?: ContentLocale
): Promise<{ detectedLocale: ContentLocale; translations: Record<ContentLocale, string> }> {
  // Detect source language if not provided
  const detectedLocale = sourceLocale || await detectLanguage(text);

  // Translate to all locales in parallel
  const translations: Record<string, string> = {};

  await Promise.all(
    CONTENT_LOCALES.map(async (locale) => {
      if (locale === detectedLocale) {
        // No need to translate to source language
        translations[locale] = text;
      } else {
        translations[locale] = await translateText(text, locale);
      }
    })
  );

  return {
    detectedLocale,
    translations: translations as Record<ContentLocale, string>,
  };
}

/**
 * Batch translate multiple fields to all locales
 * More efficient for translating multiple fields at once
 */
export async function batchTranslateFields(
  fields: { field_name: string; text: string }[]
): Promise<{
  detectedLocale: ContentLocale;
  translations: Record<ContentLocale, Record<string, string>>;
}> {
  // Use first field for language detection
  const detectedLocale = await detectLanguage(fields[0].text);

  // Build translations for each locale
  const translations: Record<string, Record<string, string>> = {};

  // Initialize all locales
  for (const locale of CONTENT_LOCALES) {
    translations[locale] = {};
  }

  // Translate all fields to all locales in parallel
  await Promise.all(
    fields.flatMap((field) =>
      CONTENT_LOCALES.map(async (locale) => {
        if (locale === detectedLocale) {
          translations[locale][field.field_name] = field.text;
        } else {
          translations[locale][field.field_name] = await translateText(
            field.text,
            locale
          );
        }
      })
    )
  );

  return {
    detectedLocale,
    translations: translations as Record<ContentLocale, Record<string, string>>,
  };
}

/**
 * Map our ContentLocale to Google Translate language codes
 */
function mapToGoogleCode(locale: ContentLocale): string {
  const mapping: Record<ContentLocale, string> = {
    en: 'en',
    vi: 'vi',
    ko: 'ko',
    zh: 'zh-CN', // Simplified Chinese
    ru: 'ru',
    fr: 'fr',
    ja: 'ja',
    ms: 'ms',
    th: 'th',
    de: 'de',
    es: 'es',
    id: 'id',
  };
  return mapping[locale] || locale;
}

/**
 * Map Google's language codes back to our ContentLocale
 */
function mapToContentLocale(googleCode: string): ContentLocale {
  const mapping: Record<string, ContentLocale> = {
    en: 'en',
    vi: 'vi',
    ko: 'ko',
    'zh-CN': 'zh',
    'zh-TW': 'zh',
    zh: 'zh',
    ru: 'ru',
    fr: 'fr',
    ja: 'ja',
    ms: 'ms',
    th: 'th',
    de: 'de',
    es: 'es',
    id: 'id',
  };

  // Default to 'en' if not in our supported locales
  return mapping[googleCode] || 'en';
}
