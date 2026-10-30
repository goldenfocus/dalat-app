import { z } from "zod";
import { LANGUAGE_NAMES, LANGUAGE_NAME_LOCALES } from "./language-names";

/** ISO 639-1 language tags with bundled names in the guest's locale. */
export const LANGUAGE_CODES = [
  "aa", "ab", "ae", "af", "ak", "am", "an", "ar", "as", "av", "ay", "az", "ba", "be", "bg", "bh", "bi", "bm", "bn", "bo", "br", "bs", "ca", "ce", "ch", "co", "cr", "cs", "cu", "cv", "cy", "da", "de", "dv", "dz", "ee", "el", "en", "eo", "es", "et", "eu", "fa", "ff", "fi", "fj", "fo", "fr", "fy", "ga", "gd", "gl", "gn", "gu", "gv", "ha", "he", "hi", "ho", "hr", "ht", "hu", "hy", "hz", "ia", "id", "ie", "ig", "ii", "ik", "io", "is", "it", "iu", "ja", "jv", "ka", "kg", "ki", "kj", "kk", "kl", "km", "kn", "ko", "kr", "ks", "ku", "kv", "kw", "ky", "la", "lb", "lg", "li", "ln", "lo", "lt", "lu", "lv", "mg", "mh", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "na", "nb", "nd", "ne", "ng", "nl", "nn", "no", "nr", "nv", "ny", "oc", "oj", "om", "or", "os", "pa", "pi", "pl", "ps", "pt", "qu", "rm", "rn", "ro", "ru", "rw", "sa", "sc", "sd", "se", "sg", "si", "sk", "sl", "sm", "sn", "so", "sq", "sr", "ss", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "ti", "tk", "tl", "tn", "to", "tr", "ts", "tt", "tw", "ty", "ug", "uk", "ur", "uz", "ve", "vi", "vo", "wa", "wo", "xh", "yi", "yo", "za", "zh", "zu",
] as const;
export const LANGUAGE_LEVELS = ["native", "fluent", "intermediate", "beginner", "new"] as const;
const languageSchema = z.enum(LANGUAGE_CODES);
export const languagePreferencesSchema = z.object({
  speaks: z.array(z.object({ language: languageSchema, level: z.enum(LANGUAGE_LEVELS) }).strict())
    .min(1).max(8).refine(items => new Set(items.map(item => item.language)).size === items.length, "Duplicate language"),
  learning: z.object({ language: languageSchema, level: z.enum(["fluent", "intermediate", "beginner", "new"]) }).strict(),
}).strict();
export type LanguagePreferences = z.infer<typeof languagePreferencesSchema>;
export type LanguageLevel = typeof LANGUAGE_LEVELS[number];
export const DEFAULT_LANGUAGE_PREFERENCES: LanguagePreferences = {
  speaks: [], learning: { language: "vi", level: "new" },
};

const PRIORITY_LANGUAGES: readonly string[] = ["en", "vi", "fr", "es"];

/** Bundled names also keep selected values readable on browsers with partial ICU data. */
export function languageDisplayName(code: typeof LANGUAGE_CODES[number], locale: string) {
  const index = LANGUAGE_NAME_LOCALES.findIndex(item => item === locale.split("-")[0]);
  return LANGUAGE_NAMES[code][index < 0 ? 0 : index];
}

/** Search localized, English and native names, including unaccented input. */
export function languageChoices(locale: string, query = "") {
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase(locale);
  const needle = normalize(query.trim());
  return LANGUAGE_CODES.map(code => {
    const label = languageDisplayName(code, locale);
    const names = LANGUAGE_NAMES[code];
    const native = names[names.length - 1];
    return { code, label, search: normalize(`${code} ${label} ${names[0]} ${native}`) };
  }).filter(item => item.search.includes(needle)).sort((a, b) => {
    const priority = (code: string) => {
      const index = PRIORITY_LANGUAGES.indexOf(code);
      return index < 0 ? PRIORITY_LANGUAGES.length : index;
    };
    return priority(a.code) - priority(b.code) || a.label.localeCompare(b.label, locale);
  });
}
