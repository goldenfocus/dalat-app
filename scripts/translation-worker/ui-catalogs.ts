import { parse } from "@formatjs/icu-messageformat-parser";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { cliJson } from "./cli";
import { CONTENT_LOCALES } from "../../lib/types";
const flat = (value: any, prefix = ""): Record<string, string> =>
  Object.fromEntries(
    Object.entries(value).flatMap(([key, v]) =>
      typeof v === "string"
        ? [[prefix + key, v]]
        : Object.entries(flat(v, prefix + key + ".")),
    ),
  );
function put(tree: any, key: string, value: string) {
  const parts = key.split(".");
  const last = parts.pop()!;
  for (const part of parts) tree = tree[part] ??= {};
  tree[last] = value;
}
async function run(locale: string) {
  const english = flat(JSON.parse(await readFile("messages/en.json", "utf8")));
  const catalog = JSON.parse(await readFile(`messages/${locale}.json`, "utf8"));
  const current = flat(catalog);
  const input = Object.fromEntries(
    Object.entries(english).filter(([key, text]) =>
      process.env.UI_SHORT_ONLY === "1"
        ? current[key] === text && text.length <= 20 && /[a-zA-Z]{3}/.test(text)
        : !current[key] ||
          [...text.matchAll(/\{([a-zA-Z_][\w]*)[},]/g)]
            .map((m) => m[1])
            .sort()
            .join() !==
            [...(current[key] || "").matchAll(/\{([a-zA-Z_][\w]*)[},]/g)]
              .map((m) => m[1])
              .sort()
              .join() ||
          (current[key] === text &&
            /[a-zA-Z]{3}/.test(text) &&
            (process.env.UI_INCLUDE_SHORT === "1" ||
              (text.length > 20 && /\s/.test(text)))),
    ),
  );
  console.log(
    `[catalog] ${locale}: ${Object.keys(input).length} candidate strings`,
  );
  if (!Object.keys(input).length) return;
  const draft = await cliJson(
    "claude",
    `You are a professional native-language UI translator for dalat.app. Translate the values of this JSON key dictionary from English to locale ${locale}. Keep the keys, ICU placeholders, markup, example names, literal paths and URLs unchanged. Natural concise UI language. Use locale conventions and don't translate brands/proper names. You may keep English only when it is entirely a proper name, literal code, or example data that must remain unchanged. Return only {"strings":{same keys and translated string values}}. No tools. INPUT:\n${JSON.stringify(input)}`,
  );
  const review = await cliJson(
    "codex",
    `Independently review these UI translations from English into ${locale}, for a friendly guide to Da Lat. Correct every error, unnatural phrasing and missing translation. Do not change keys or ICU placeholders (including plural/select syntax). Translate all prose; preserve brands, URLs, examples and markup. Return only {"strings":{all same keys and corrected string values},"unchangedReasons":{key:reason for any legitimately unchanged source text}}. No tools. SOURCE:${JSON.stringify(input)}\nDRAFT:${JSON.stringify(draft.strings)}`,
  );
  const placeholders = (s: string) =>
    [...new Set([...s.matchAll(/\{([a-zA-Z_][\w]*)[},]/g)].map((m) => m[1]))]
      .sort()
      .join(",");
  for (const [key, source] of Object.entries(input)) {
    const value = review.strings?.[key];
    if (
      typeof value !== "string" ||
      !value.trim() ||
      placeholders(source) !== placeholders(value)
    )
      throw new Error(`${locale}.${key}: missing or changed placeholders`);
    if (value === source && !review.unchangedReasons?.[key])
      throw new Error(`${locale}.${key}: unexplained English`);
    parse(value);
    put(catalog, key, value);
  }
  await writeFile(
    `messages/${locale}.json`,
    JSON.stringify(catalog, null, 2) + "\n",
  );
  await mkdir(".translation-worker/catalogs", { recursive: true });
  await writeFile(
    `.translation-worker/catalogs/${locale}.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        translator: "sonnet high",
        reviewer: "gpt-6.1-sol high",
        keys: Object.keys(input),
        unchangedReasons: review.unchangedReasons,
      },
      null,
      2,
    ),
  );
  console.log(`[catalog] ${locale}: translated and independently reviewed`);
}
async function main() {
  const pending = CONTENT_LOCALES.filter(
    (x) =>
      x !== "en" &&
      (!process.env.UI_LOCALES ||
        process.env.UI_LOCALES.split(",").includes(x)),
  );
  await Promise.all(
    Array.from({ length: Number(process.env.UI_CONCURRENCY || 3) }).map(
      async () => {
        while (pending.length) {
          const locale = pending.shift()!;
          try {
            await run(locale);
          } catch (e) {
            console.error(`[catalog] ${locale} failed`, e);
            process.exitCode = 1;
          }
        }
      },
    ),
  );
}
main();
