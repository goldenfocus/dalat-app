import { readFileSync } from "node:fs";
import { parse } from "@formatjs/icu-messageformat-parser";
const locales = [
  "en",
  "vi",
  "ko",
  "zh",
  "ru",
  "fr",
  "ja",
  "ms",
  "th",
  "de",
  "es",
  "id",
];
const flatten = (object, prefix = "") =>
  Object.fromEntries(
    Object.entries(object).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[prefix + key, value]]
        : Object.entries(flatten(value, prefix + key + ".")),
    ),
  );
const source = flatten(JSON.parse(readFileSync("messages/en.json", "utf8")));
// Only verified brand names, file formats and official event names may retain long English copy.
const identicalAllowed = new Set([
  "calendar.appleOutlook",
  "moments.proUpload.supportedFormats",
  "flowerFestivalGuide.edition2026.schema.jazzName",
  "de.venuePages.restaurants.h1", // Restaurants in Da Lat is also natural German.
]);
const errors = [];
const argumentsOf = (ast) => {
  const result = new Set();
  const walk = (nodes) =>
    nodes.forEach((node) => {
      if ([1, 2, 3, 4, 5, 6].includes(node.type)) result.add(node.value);
      if (node.options)
        Object.values(node.options).forEach((option) => walk(option.value));
      if (node.children) walk(node.children);
    });
  walk(ast);
  return [...result].sort().join(",");
};
for (const locale of locales) {
  const target = flatten(
    JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")),
  );
  for (const [key, value] of Object.entries(source)) {
    if (!target[key]?.trim()) {
      errors.push(`${locale}.${key}: missing or empty`);
      continue;
    }
    if (
      locale !== "en" &&
      target[key] === value &&
      value.length > 20 &&
      /[a-zA-Z]{3}/.test(value) &&
      /\s/.test(value) &&
      !identicalAllowed.has(key) &&
      !identicalAllowed.has(`${locale}.${key}`)
    )
      errors.push(`${locale}.${key}: untranslated English prose`);
    try {
      if (argumentsOf(parse(value)) !== argumentsOf(parse(target[key])))
        errors.push(`${locale}.${key}: changed ICU arguments`);
    } catch (error) {
      errors.push(`${locale}.${key}: invalid ICU: ${error.message}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `All ${locales.length} catalogs contain ${Object.keys(source).length} source keys with valid ICU arguments.`,
  );
