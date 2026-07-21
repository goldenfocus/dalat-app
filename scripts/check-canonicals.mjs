#!/usr/bin/env node
/**
 * Canonical ratchet — every page that exports generateMetadata must emit
 * canonical/hreflang alternates (directly or via a lib/metadata helper).
 *
 * Why: the [locale] layout sets alternates.canonical to the locale HOMEPAGE.
 * Next's metadata merge means any page that skips `alternates` inherits it —
 * so the page tells Google "the canonical version of me is the homepage",
 * which suppresses long-tail indexing. This shipped on EVERY event page.
 *
 * Frozen offenders existed before the ratchet. Do not add to this list —
 * fix new pages instead. When you fix a frozen file, remove it here.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FROZEN_OFFENDERS = new Set([
  "app/[locale]/series/[slug]/page.tsx",
  "app/[locale]/activity/page.tsx",
  "app/[locale]/invite/[token]/page.tsx",
  "app/[locale]/venues/[slug]/events/page.tsx",
  "app/[locale]/events/[slug]/moments/new/page.tsx",
  "app/[locale]/events/[slug]/table/page.tsx",
  "app/[locale]/events/[slug]/live/page.tsx",
  "app/[locale]/events/[slug]/live/broadcast/page.tsx",
]);

const HELPER_PATTERN =
  /alternates|generateLocalizedMetadata|generate(Venue|Organizer|Profile|Moment|Festival|Series|MomentsDiscovery)Metadata|buildAlternates/;

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (name === "page.tsx") files.push(path);
  }
  return files;
}

const offenders = [];
const fixedFrozen = [];

for (const file of walk("app/[locale]")) {
  const source = readFileSync(file, "utf8");
  if (!/function generateMetadata/.test(source)) continue;

  const hasAlternates = HELPER_PATTERN.test(source);
  if (!hasAlternates && !FROZEN_OFFENDERS.has(file)) {
    offenders.push(file);
  } else if (hasAlternates && FROZEN_OFFENDERS.has(file)) {
    fixedFrozen.push(file);
  }
}

if (fixedFrozen.length > 0) {
  console.log(
    `check-canonicals: 🎉 frozen offender(s) now fixed — remove from FROZEN_OFFENDERS in scripts/check-canonicals.mjs:\n  ${fixedFrozen.join("\n  ")}`
  );
}

if (offenders.length > 0) {
  console.error(
    `\x1b[31mcheck-canonicals: ${offenders.length} page(s) export generateMetadata WITHOUT canonical/hreflang alternates.\n` +
      `Without alternates, the page inherits the locale layout's HOMEPAGE canonical and Google suppresses it.\n` +
      `Fix: add \`alternates: buildAlternates(locale, path)\` (lib/metadata.ts) or use generateLocalizedMetadata.\n  ${offenders.join("\n  ")}\x1b[0m`
  );
  process.exit(1);
}

console.log("✓ check-canonicals: all generateMetadata pages emit alternates (8 frozen legacy offenders)");
