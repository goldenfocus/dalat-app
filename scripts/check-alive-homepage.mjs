// Alive-homepage ratchet: fails if the homepage regresses to generic/dead.
// Run post-deploy: node scripts/check-alive-homepage.mjs [url]
// Uses curl (follows redirects) — node fetch is unreliable in some sandboxes.
import { execFileSync } from "child_process";

const url = process.argv[2] ?? "https://dalat.app/en";
let html;
try {
  html = execFileSync(
    "curl",
    ["-sL", "--max-time", "30", "-A", "alive-ratchet", url],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
} catch (err) {
  console.error(`FAIL: could not fetch ${url}: ${err.message}`);
  process.exit(1);
}
if (!html || html.length < 1000) {
  console.error(`FAIL: ${url} returned suspiciously little HTML (${html?.length ?? 0} bytes)`);
  process.exit(1);
}

// Counts every rendered <img> instance of the default art page-wide (a card
// can emit several). Measured 48 pre-feature — the ceiling starts just below
// that and ratchets down as series accumulate photo history.
const defaultCovers = (html.match(/event-default-desktop/g) ?? []).length;
const MAX_DEFAULT_COVERS = 40;

// At least one card must render a real moment photo as its cover.
const hasMomentCover = /cdn\.dalat\.app\/moments\//.test(html);

// Zero counts only matter in visible text — script tags carry RSC/JSON
// payloads full of URLs like ".../e520e0/1773997607125.jpeg" that false-match.
const visibleHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const zeroGoing = /(^|[^0-9a-z.])0\/\d+|(^|[^0-9a-z.])0 going/i.test(visibleHtml);

let failed = false;
if (defaultCovers > MAX_DEFAULT_COVERS) {
  console.error(
    `FAIL: ${defaultCovers} generic default covers on ${url} (max ${MAX_DEFAULT_COVERS})`
  );
  failed = true;
}
if (!hasMomentCover) {
  console.error(`FAIL: no real moment-photo cover found on ${url}`);
  failed = true;
}
if (zeroGoing) {
  console.error(`FAIL: a card on ${url} renders a zero going-count`);
  failed = true;
}
if (failed) process.exit(1);
console.log(
  `OK: ${defaultCovers} default covers (≤${MAX_DEFAULT_COVERS}), moment cover present, no zero counts on ${url}`
);
