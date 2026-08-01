// Cost-safety ratchet: DALAT translation runs only on the Mac mini.
// Fail the build if an API key or direct Google Translation endpoint returns.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "cloudflare", "lib", "scripts"];
const SELF = "scripts/check-no-google-translate.mjs";
const BANNED = [
  ["translation", ".googleapis.com"].join(""),
  ["translate", ".googleapis.com"].join(""),
  ["GOOGLE_CLOUD", "_TRANSLATION_API_KEY"].join(""),
];
const bad = [];

function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(path);
      continue;
    }
    if (path === SELF || !/\.(?:js|mjs|cjs|ts|tsx)$/.test(path)) continue;
    const source = readFileSync(path, "utf8");
    for (const token of BANNED) {
      if (source.includes(token)) bad.push(`${path}: ${token}`);
    }
  }
}

for (const root of ROOTS) scan(root);

if (bad.length > 0) {
  console.error("⛔ Google Cloud Translation usage is forbidden; the Mac mini is the sole translator:");
  for (const line of bad) console.error(`  ${line}`);
  process.exit(1);
}

console.log("✓ Google Cloud Translation paths are absent");
