#!/usr/bin/env node
/** Public, raw-HTML venue search audit. Never prints environment values or uses service-role access. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
config({ path: ".env.local", quiet: true });
const args = process.argv.slice(2);
const option = (key, fallback) =>
  args.find((value) => value.startsWith(`--${key}=`))?.slice(key.length + 3) ||
  fallback;
const allLocales = [
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
const locales =
  option("locales", "en,de") === "all"
    ? allLocales
    : option("locales", "en,de").split(",");
if (locales.some((locale) => !allLocales.includes(locale)))
  throw new Error("Unsupported audit locale");
const output = option("out", "/tmp/dalat-venue-seo/audit.json");
const base = new URL(option("base", "https://dalat.app"));
if (!["https:", "http:"].includes(base.protocol))
  throw new Error("Invalid audit base");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);
const venues = [];
for (let offset = 0; ; offset += 500) {
  const { data, error } = await db
    .from("venues")
    .select("id,slug,name,description,source_locale")
    .order("slug")
    .range(offset, offset + 499);
  if (error) throw new Error(error.message);
  venues.push(...data);
  if (data.length < 500) break;
}
const selected = option("slug", "")
  ? venues.filter((venue) => venue.slug === option("slug", ""))
  : args.includes("--all")
    ? venues
    : venues.slice(0, 3);
if (!selected.length) throw new Error("No matching public venue");
const bots = {
  Googlebot:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "OAI-SearchBot":
    "Mozilla/5.0 (compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot)",
  "Claude-SearchBot":
    "Claude-SearchBot/1.0; +https://www.anthropic.com/claude-searchbot",
  PerplexityBot:
    "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
};
const decode = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39|#x27);/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const normalize = (value) => decode(value).replace(/\s+/g, " ").trim();
function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)=["']([^"']*)["']/g)].map((match) => [
      match[1].toLowerCase(),
      decode(match[2]),
    ]),
  );
}
function inspect(html, venue, locale, expectedDescription, expectedIndex) {
  const failures = [];
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
  if (!/<title\b[^>]*>[^<]+<\/title>/i.test(head)) failures.push("head-title");
  const url = `${base.origin}${locale === "en" ? "" : `/${locale}`}/${venue.slug}`;
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((match) =>
    attributes(match[0]),
  );
  const meta = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) =>
    attributes(match[0]),
  );
  if (!meta.some((tag) => tag.name === "description" && tag.content?.trim()))
    failures.push("head-description");
  if (!links.some((link) => link.rel === "canonical" && link.href === url))
    failures.push("canonical");
  const noindex = meta.some(
    (tag) =>
      (tag.name === "robots" || tag.name === "googlebot") &&
      /noindex/i.test(tag.content || ""),
  );
  if (expectedIndex === noindex) failures.push("indexing-readiness");
  // Script data alone does not prove a crawler can read the rendered page.
  const visible = normalize(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " "),
  );
  if (!visible.includes(normalize(venue.name)))
    failures.push("server-visible-name");
  if (
    expectedDescription &&
    !visible.includes(normalize(expectedDescription).slice(0, 80))
  )
    failures.push("server-visible-description");
  const nodes = [];
  const flatten = (node) => {
    if (Array.isArray(node)) return node.forEach(flatten);
    if (node && typeof node === "object") {
      nodes.push(node);
      if (node["@graph"]) flatten(node["@graph"]);
    }
  };
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      flatten(JSON.parse(match[1]));
    } catch {
      failures.push("invalid-jsonld");
    }
  }
  const placeId = `https://dalat.app/${venue.slug}#place`;
  if (
    !nodes.some(
      (node) =>
        node["@id"] === placeId && node.name === venue.name && node.url === url,
    )
  )
    failures.push("place-identity");
  if (
    !nodes.some(
      (node) =>
        node["@type"] === "WebPage" &&
        node.url === url &&
        node.inLanguage === locale &&
        node.mainEntity?.["@id"] === placeId,
    )
  )
    failures.push("localized-webpage");
  if (!nodes.some((node) => node["@type"] === "BreadcrumbList"))
    failures.push("breadcrumbs");
  return { failures, indexable: !noindex };
}
const checks = [];
for (const venue of selected) {
  const { data, error } = await db
    .from("content_translations")
    .select("target_locale,translated_text")
    .eq("content_type", "venue")
    .eq("content_id", venue.id)
    .eq("field_name", "description");
  if (error) throw new Error(error.message);
  for (const locale of locales) {
    const translated = data
      .find((row) => row.target_locale === locale)
      ?.translated_text?.trim();
    const expectedIndex =
      !venue.description?.trim() ||
      locale === (venue.source_locale || "und") ||
      !!translated;
    for (const [bot, ua] of Object.entries(bots))
      checks.push({
        venue,
        locale,
        bot,
        ua,
        expectedIndex,
        description: translated || venue.description,
      });
  }
}
const report = {
  at: new Date().toISOString(),
  base: base.origin,
  venues: selected.length,
  note: "User-agent probes test raw HTML delivery from this machine. They do not verify authenticated crawler IPs or prove indexing, ranking or AI citations.",
  results: [],
};
// Two lanes; no burst of crawler probes against production.
await Promise.all(
  [0, 1].map(async () => {
    while (checks.length) {
      const check = checks.shift();
      const url = `${base.origin}${check.locale === "en" ? "" : `/${check.locale}`}/${check.venue.slug}`;
      const started = Date.now();
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": check.ua },
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
        const html = await response.text();
        const result = inspect(
          html,
          check.venue,
          check.locale,
          check.description,
          check.expectedIndex,
        );
        if (response.status !== 200)
          result.failures.unshift(`HTTP-${response.status}`);
        if (response.headers.get("cf-mitigated"))
          result.failures.unshift("edge-challenge");
        report.results.push({
          url,
          bot: check.bot,
          status: response.status,
          ms: Date.now() - started,
          ...result,
        });
      } catch (error) {
        report.results.push({
          url,
          bot: check.bot,
          failures: [String(error).slice(0, 200)],
        });
      }
    }
  }),
);
report.failed = report.results.filter(
  (result) => result.failures.length,
).length;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    venues: report.venues,
    checked: report.results.length,
    failed: report.failed,
    report: output,
    note: report.note,
  }),
);
process.exitCode = report.failed ? 1 : 0;
