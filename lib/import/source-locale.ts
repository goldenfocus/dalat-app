import { CONTENT_LOCALES, type ContentLocale } from "@/lib/types";

/** Vietnamese letters that do not appear in French/Portuguese loan spelling. */
const VIETNAMESE_UNIQUE =
  /[ăđơưạảãặắằẳẵấầẩẫậẹẻẽếềểễệỉịọỏõốồổỗộớờởỡợụủũứừửữựỳỵỷỹ]/i;

/**
 * Cheap script hint for scout/review rows. Does not call a model and does not
 * invent translations. Returns null when the script is ambiguous so the Mac
 * mini worker can detectLanguage later.
 */
export function inferSourceLocale(
  title: string,
  description?: string | null,
): ContentLocale | null {
  const text = `${title} ${description ?? ""}`;
  if (VIETNAMESE_UNIQUE.test(text)) return "vi";
  // Explicit ranges — avoid \p{Script=…} so SWC/es2017 minifiers stay happy.
  if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(text)) return "ko";
  if (/[\u3040-\u30FF]/.test(text)) return "ja";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  if (/[\u0E00-\u0E7F]/.test(text)) return "th";
  return null;
}

export function asContentLocale(value: string | null | undefined): ContentLocale | null {
  const normalized = value?.trim().toLowerCase().slice(0, 2);
  if (!normalized) return null;
  return CONTENT_LOCALES.includes(normalized as ContentLocale)
    ? (normalized as ContentLocale)
    : null;
}

export function resolveStoredSourceLocale(
  stored: string | null | undefined,
  title: string,
  description?: string | null,
): ContentLocale | null {
  return asContentLocale(stored) ?? inferSourceLocale(title, description);
}
