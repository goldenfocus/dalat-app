/**
 * Client-safe translation utilities
 * These functions can be imported in client components ("use client")
 */

import type { TranslationContentType, TranslationFieldName } from '@/lib/types';

/**
 * Mark source fields for translation and wait until the server has durably
 * invalidated any stale automatic rows. Callers may ignore the returned
 * promise for newly created content, but edit flows should await it.
 * Safe to use in client components.
 */
export async function triggerTranslation(
  contentType: TranslationContentType,
  contentId: string,
  fields: { field_name: TranslationFieldName; text: string }[]
): Promise<boolean> {
  try {
    const response = await fetch('/api/translate', {
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
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error(`Translation invalidation failed (${response.status}): ${detail}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Translation trigger failed:', error);
    return false;
  }
}
