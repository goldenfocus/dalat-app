#!/usr/bin/env node
/**
 * Robots ratchet — AI/search crawlers must never be blanket-blocked.
 *
 * Why: until Jul 2026, robots.ts had an AI-crawler group with `disallow: "/"`
 * plus an unprefixed allowlist that matched almost no real (locale-prefixed)
 * URLs — GPTBot/ClaudeBot/PerplexityBot were blocked from the entire site,
 * making dalat.app invisible to ChatGPT/Claude/Perplexity citations.
 *
 * Invariants enforced on app/robots.ts source:
 *  1. No rule contains a blanket `disallow: "/"`.
 *  2. There is an `allow: "/"` rule.
 *  3. Locale-prefixed private routes are covered (allLocales expansion present).
 */
import { readFileSync } from "node:fs";

const source = readFileSync("app/robots.ts", "utf8");
const errors = [];

if (/disallow:\s*["']\/["']/.test(source)) {
  errors.push('robots.ts contains a blanket `disallow: "/"` — this blocks crawlers from the whole site.');
}

if (!/allow:\s*["']\/["']/.test(source)) {
  errors.push('robots.ts has no `allow: "/"` rule.');
}

if (!/allLocales/.test(source)) {
  errors.push(
    "robots.ts does not expand disallows across locale prefixes (allLocales) — /vi/settings etc. would be crawlable."
  );
}

if (errors.length > 0) {
  console.error(`\x1b[31mcheck-robots-ai FAILED:\n  ${errors.join("\n  ")}\x1b[0m`);
  process.exit(1);
}

console.log("✓ check-robots-ai: crawlers (incl. AI bots) allowed on content, private routes blocked in all locales");
