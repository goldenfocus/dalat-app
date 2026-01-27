import { createClient, createStaticClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type {
  ContentLocale,
  TranslationContentType,
  TranslationFieldName,
  Event,
  Moment,
} from '@/lib/types';
import { CONTENT_LOCALES } from '@/lib/types';
import { batchTranslateFields } from '@/lib/google-translate';

// Fallback chain: requested locale -> English -> original
const FALLBACK_LOCALE: ContentLocale = 'en';

/**
 * Fetch translations for a piece of content
 */
export async function getTranslations(
  contentType: TranslationContentType,
  contentId: string,
  targetLocale: ContentLocale
): Promise<Map<TranslationFieldName, string>> {
  const supabase = await createClient();

  const { data: translations } = await supabase
    .from('content_translations')
    .select('field_name, translated_text')
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .eq('target_locale', targetLocale);

  const result = new Map<TranslationFieldName, string>();

  if (translations) {
    for (const t of translations) {
      result.set(t.field_name as TranslationFieldName, t.translated_text);
    }
  }

  return result;
}

/**
 * Fetch translations with fallback chain
 */
export async function getTranslationsWithFallback(
  contentType: TranslationContentType,
  contentId: string,
  targetLocale: ContentLocale,
  fallbackFields: Record<TranslationFieldName, string | null>
): Promise<Record<string, string | null>> {
  // Try requested locale first
  const translations = await getTranslations(contentType, contentId, targetLocale);

  const result: Record<string, string | null> = {};

  for (const [fieldName, originalValue] of Object.entries(fallbackFields)) {
    // Use translation if available
    const translated = translations.get(fieldName as TranslationFieldName);
    if (translated) {
      result[fieldName] = translated;
      continue;
    }

    // Try English fallback if not the requested locale
    if (targetLocale !== FALLBACK_LOCALE) {
      const englishTranslations = await getTranslations(contentType, contentId, FALLBACK_LOCALE);
      const englishTranslation = englishTranslations.get(fieldName as TranslationFieldName);
      if (englishTranslation) {
        result[fieldName] = englishTranslation;
        continue;
      }
    }

    // Fall back to original value
    result[fieldName] = originalValue;
  }

  return result;
}

/**
 * Event with translations
 */
export interface TranslatedEvent extends Event {
  translated_title: string;
  translated_description: string | null;
  is_translated: boolean;
}

/**
 * Fetch an event with its translations for a specific locale
 */
export async function getEventWithTranslations(
  slug: string,
  targetLocale: ContentLocale
): Promise<TranslatedEvent | null> {
  const supabase = await createClient();

  // Fetch the event
  const { data: event, error } = await supabase
    .from('events')
    .select(`
      *,
      profiles:created_by (*),
      organizers:organizer_id (*),
      tribes:tribe_id (*)
    `)
    .eq('slug', slug)
    .single();

  if (error || !event) {
    return null;
  }

  // Determine source locale
  const sourceLocale = (event as Event & { source_locale?: string }).source_locale || 'en';

  // If target locale matches source, return original content without translation lookup
  if (targetLocale === sourceLocale) {
    return {
      ...event,
      translated_title: event.title,
      translated_description: event.description,
      is_translated: false,
    } as TranslatedEvent;
  }

  // Fetch translations for this event
  const translations = await getTranslationsWithFallback(
    'event',
    event.id,
    targetLocale,
    {
      title: event.title,
      description: event.description,
      text_content: null,
      bio: null,
      story_content: null,
      technical_content: null,
      meta_description: null,
    }
  );

  return {
    ...event,
    translated_title: translations.title || event.title,
    translated_description: translations.description,
    is_translated: translations.title !== event.title || translations.description !== event.description,
  } as TranslatedEvent;
}

/**
 * Moment with translations
 */
export interface TranslatedMoment extends Moment {
  translated_text_content: string | null;
  is_translated: boolean;
}

/**
 * Fetch a moment with its translations for a specific locale
 */
export async function getMomentWithTranslations(
  momentId: string,
  targetLocale: ContentLocale
): Promise<TranslatedMoment | null> {
  const supabase = await createClient();

  const { data: moment, error } = await supabase
    .from('moments')
    .select(`
      *,
      profiles:user_id (*)
    `)
    .eq('id', momentId)
    .single();

  if (error || !moment) {
    return null;
  }

  // Only fetch translations if there's text content
  if (!moment.text_content) {
    return {
      ...moment,
      translated_text_content: null,
      is_translated: false,
    } as TranslatedMoment;
  }

  // Determine source locale
  const sourceLocale = (moment as Moment & { source_locale?: string }).source_locale || 'en';

  // If target locale matches source, return original content without translation lookup
  if (targetLocale === sourceLocale) {
    return {
      ...moment,
      translated_text_content: moment.text_content,
      is_translated: false,
    } as TranslatedMoment;
  }

  const translations = await getTranslationsWithFallback(
    'moment',
    moment.id,
    targetLocale,
    {
      title: null,
      description: null,
      text_content: moment.text_content,
      bio: null,
      story_content: null,
      technical_content: null,
      meta_description: null,
    }
  );

  return {
    ...moment,
    translated_text_content: translations.text_content,
    is_translated: translations.text_content !== moment.text_content,
  } as TranslatedMoment;
}

/**
 * Trigger translation for content (fire-and-forget)
 * This is called after content creation to translate in the background
 * NOTE: This version uses HTTP fetch - works in browser but NOT in server-side API routes
 */
export async function triggerTranslation(
  contentType: TranslationContentType,
  contentId: string,
  fields: { field_name: TranslationFieldName; text: string }[]
): Promise<void> {
  // Fire and forget - don't await
  fetch('/api/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content_type: contentType,
      content_id: contentId,
      fields,
      detect_language: true,
    }),
  }).catch((error) => {
    console.error('Translation trigger failed:', error);
  });
}

/**
 * Server-side translation trigger - use this in API routes
 * Directly calls the translation API without HTTP, so it works in server context
 */
export async function triggerTranslationServer(
  contentType: TranslationContentType,
  contentId: string,
  fields: { field_name: TranslationFieldName; text: string }[]
): Promise<void> {
  // Filter out empty fields
  const fieldsToTranslate = fields.filter(f => f.text && f.text.trim().length > 0);
  if (fieldsToTranslate.length === 0) return;

  try {
    // Use service role client for server-side operations
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Call Google Translate API
    const { detectedLocale, translations } = await batchTranslateFields(fieldsToTranslate);

    // Update source_locale on the content
    if (contentType === 'event') {
      await supabase
        .from('events')
        .update({ source_locale: detectedLocale })
        .eq('id', contentId);
    } else if (contentType === 'moment') {
      await supabase
        .from('moments')
        .update({ source_locale: detectedLocale })
        .eq('id', contentId);
    } else if (contentType === 'profile') {
      await supabase
        .from('profiles')
        .update({ bio_source_locale: detectedLocale })
        .eq('id', contentId);
    }

    // Prepare translation inserts
    const translationInserts: {
      content_type: string;
      content_id: string;
      source_locale: string;
      target_locale: string;
      field_name: string;
      translated_text: string;
      translation_status: string;
    }[] = [];

    for (const locale of CONTENT_LOCALES) {
      // Skip same-language translations - they're useless and can contain incorrect data
      if (locale === detectedLocale) continue;

      const localeTranslations = translations[locale];
      if (!localeTranslations) continue;

      for (const field of fieldsToTranslate) {
        const translatedText = localeTranslations[field.field_name];
        if (!translatedText) continue;

        translationInserts.push({
          content_type: contentType,
          content_id: contentId,
          source_locale: detectedLocale,
          target_locale: locale,
          field_name: field.field_name,
          translated_text: translatedText,
          translation_status: 'auto',
        });
      }
    }

    // Upsert translations
    if (translationInserts.length > 0) {
      const { error } = await supabase
        .from('content_translations')
        .upsert(translationInserts, {
          onConflict: 'content_type,content_id,target_locale,field_name',
        });

      if (error) {
        console.error('[triggerTranslationServer] Insert error:', error);
      } else {
        console.log(`[triggerTranslationServer] Translated ${contentType}:${contentId} to ${CONTENT_LOCALES.length} locales`);
      }
    }
  } catch (error) {
    console.error('[triggerTranslationServer] Translation failed:', error);
  }
}

/**
 * Check if a locale is valid
 */
export function isValidContentLocale(locale: string): locale is ContentLocale {
  return CONTENT_LOCALES.includes(locale as ContentLocale);
}

/**
 * Batch fetch translations for multiple events (efficient for list pages)
 * Uses static client for ISR compatibility - translations are public data
 */
export async function getEventTranslationsBatch(
  eventIds: string[],
  targetLocale: ContentLocale
): Promise<Map<string, { title: string; description: string | null }>> {
  if (eventIds.length === 0) {
    return new Map();
  }

  try {
    // Use static client for ISR context (no cookies needed for public translations)
    const supabase = createStaticClient();
    if (!supabase) {
      console.error("Failed to create Supabase client for translations");
      return new Map();
    }

    const { data: translations } = await supabase
      .from('content_translations')
      .select('content_id, field_name, translated_text')
      .eq('content_type', 'event')
      .in('content_id', eventIds)
      .eq('target_locale', targetLocale)
      .in('field_name', ['title', 'description']);

    const result = new Map<string, { title: string; description: string | null }>();

    if (translations) {
      for (const t of translations) {
        const existing = result.get(t.content_id) || { title: '', description: null };
        if (t.field_name === 'title') {
          existing.title = t.translated_text;
        } else if (t.field_name === 'description') {
          existing.description = t.translated_text;
        }
        result.set(t.content_id, existing);
      }
    }

    return result;
  } catch (err) {
    console.error("Exception in getEventTranslationsBatch:", err);
    return new Map();
  }
}

/**
 * Batch fetch translations for multiple blog posts (efficient for list pages)
 */
export async function getBlogTranslationsBatch(
  postIds: string[],
  targetLocale: ContentLocale
): Promise<Map<string, { title: string; story_content: string }>> {
  const supabase = await createClient();

  const { data: translations } = await supabase
    .from('content_translations')
    .select('content_id, field_name, translated_text')
    .eq('content_type', 'blog')
    .in('content_id', postIds)
    .eq('target_locale', targetLocale)
    .in('field_name', ['title', 'story_content']);

  const result = new Map<string, { title: string; story_content: string }>();

  if (translations) {
    for (const t of translations) {
      const existing = result.get(t.content_id) || { title: '', story_content: '' };
      if (t.field_name === 'title') {
        existing.title = t.translated_text;
      } else if (t.field_name === 'story_content') {
        existing.story_content = t.translated_text;
      }
      result.set(t.content_id, existing);
    }
  }

  return result;
}

/**
 * Blog post with translations
 */
export interface TranslatedBlogFields {
  translated_title: string;
  translated_story_content: string;
  translated_technical_content: string;
  translated_meta_description: string | null;
  is_translated: boolean;
}

/**
 * Fetch translations for a blog post
 */
export async function getBlogTranslations(
  blogPostId: string,
  targetLocale: ContentLocale,
  originalFields: {
    title: string;
    story_content: string;
    technical_content: string;
    meta_description: string | null;
    source_locale?: string | null;
  }
): Promise<TranslatedBlogFields> {
  const sourceLocale = originalFields.source_locale || 'en';

  // If target is same as source, return original content
  if (targetLocale === sourceLocale) {
    return {
      translated_title: originalFields.title,
      translated_story_content: originalFields.story_content,
      translated_technical_content: originalFields.technical_content,
      translated_meta_description: originalFields.meta_description,
      is_translated: false,
    };
  }

  const translations = await getTranslationsWithFallback(
    'blog',
    blogPostId,
    targetLocale,
    {
      title: originalFields.title,
      description: null,
      text_content: null,
      bio: null,
      story_content: originalFields.story_content,
      technical_content: originalFields.technical_content,
      meta_description: originalFields.meta_description,
    }
  );

  const hasTranslations =
    translations.title !== originalFields.title ||
    translations.story_content !== originalFields.story_content ||
    translations.technical_content !== originalFields.technical_content;

  return {
    translated_title: translations.title || originalFields.title,
    translated_story_content: translations.story_content || originalFields.story_content,
    translated_technical_content: translations.technical_content || originalFields.technical_content,
    translated_meta_description: translations.meta_description,
    is_translated: hasTranslations,
  };
}
