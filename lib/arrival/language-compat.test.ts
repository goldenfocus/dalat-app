import { expect, it } from "vitest";
import { legacyLanguageChoices } from "./language-compat";
import type { LanguageLevel } from "./languages";
it.each([['native','native'],['fluent','fluent'],['intermediate','comfortable'],['beginner','some'],['new','starting']] as const)("preserves %s as legacy %s", (rich, legacy) => {
  expect(legacyLanguageChoices({ speaks: [{ language: 'en', level: rich as LanguageLevel }], learning: { language: 'vi', level: 'new' } })).toMatchObject({ englishLevel: legacy, vietnameseLevel: 'starting', practiceLanguage: 'vietnamese' });
});
