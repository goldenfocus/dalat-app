// Ratchet: lib/blog/ must stay SDK-free — recaps run on the keyless
// Mac-mini pipeline. A paid-key import sneaking back in is a silent
// money+outage path (Anthropic SDK throws at import when the key is absent).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "lib/blog";
const BANNED = ["@anthropic-ai/sdk", "openai", "@google/generative-ai"];
// Frozen legacy offenders (pre-existing, ported separately). Adding a NEW
// file to this list is a ratchet violation — port it to the keyless chain
// instead.
const FROZEN = new Set(["lib/blog/content-generator.ts"]);

const bad = [];
for (const file of readdirSync(DIR)) {
  if (!/\.(ts|tsx|mjs|js)$/.test(file)) continue;
  const path = join(DIR, file);
  if (FROZEN.has(path)) continue;
  const src = readFileSync(path, "utf8");
  for (const pkg of BANNED) {
    if (src.includes(`"${pkg}`) || src.includes(`'${pkg}`)) bad.push(`${path}: ${pkg}`);
  }
}
if (bad.length) {
  console.error("⛔ Paid-SDK import in lib/blog/ (recaps must stay keyless):");
  for (const line of bad) console.error("  " + line);
  process.exit(1);
}
console.log("✓ lib/blog/ is keyless");
