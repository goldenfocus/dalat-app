import type { LanguageLevel, LanguagePreferences } from "./languages";
const level = (value?: LanguageLevel) => value === "native" ? "native" as const : value === "fluent" ? "fluent" as const : value === "intermediate" ? "comfortable" as const : value === "beginner" ? "some" as const : "starting" as const;
/** Keep the first pilot's English/Vietnamese filters while retaining the full profile. */
export function legacyLanguageChoices(preferences: LanguagePreferences) {
  const learning = preferences.learning;
  return {
    practiceLanguage: learning.language === "vi" ? "vietnamese" as const : learning.language === "en" ? "english" as const : "both" as const,
    englishLevel: level(learning.language === "en" ? learning.level : preferences.speaks.find(item => item.language === "en")?.level),
    vietnameseLevel: level(learning.language === "vi" ? learning.level : preferences.speaks.find(item => item.language === "vi")?.level),
  };
}
