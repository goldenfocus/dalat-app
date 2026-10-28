import { z } from "zod";

// Keep the existing values so previous check-ins retain their meaning.
export const LANGUAGE_LEVELS = ["starting", "some", "comfortable", "advanced", "fluent", "native"] as const;
export const languageLevelSchema = z.enum(LANGUAGE_LEVELS);
export const languagePreferencesSchema = z.object({
  practiceLanguage: z.enum(["english", "vietnamese", "both"]),
  englishLevel: languageLevelSchema,
  vietnameseLevel: languageLevelSchema,
}).strict();
export type LanguagePreferences = z.infer<typeof languagePreferencesSchema>;
export type LanguageLevel = LanguagePreferences["englishLevel"];
export type LanguageChoices = { [K in keyof LanguagePreferences]: LanguagePreferences[K] | null };
export const emptyLanguageChoices: LanguageChoices = { practiceLanguage: null, englishLevel: null, vietnameseLevel: null };
export function completeLanguageChoices(value: LanguageChoices): value is LanguagePreferences {
  return languagePreferencesSchema.safeParse(value).success;
}
