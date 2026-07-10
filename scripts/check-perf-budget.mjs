// Perf-budget ratchet: fails if the homepage payload regresses.
// Run post-deploy: node scripts/check-perf-budget.mjs [url]
// Uses curl (follows redirects) — node fetch is unreliable in some sandboxes.
import { execFileSync } from "child_process";
import { brotliDecompressSync, gunzipSync } from "zlib";

// Ceilings. Never raise one without a comment explaining why.
const HTML_BUDGET = 55000; // compressed bytes — ratchet down to 35000 after i18n split lands
const JS_BUDGET = 520000; // compressed bytes, summed across all /_next/static scripts
const CHUNK_BUDGET = 34; // max /_next/static script tags on the homepage
// Flip to true once the Cloudflare cache rule for / exists.
const ENFORCE_EDGE_HIT = false;

const url = process.argv[2] ?? "https://dalat.app/";
const origin = new URL(url).origin;

// Full response: final status + headers + compressed body bytes.
function fetchBr(target) {
  const raw = execFileSync(
    "curl",
    ["-siL", "--max-time", "30", "-A", "perf-ratchet", "-H", "Accept-Encoding: br", target],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  // -i with -L emits one header block per hop before the final body.
  let buf = raw;
  let status = 0;
  let headers = {};
  while (buf.slice(0, 5).toString() === "HTTP/") {
    const end = buf.indexOf("\r\n\r\n");
    if (end === -1) break;
    const lines = buf.slice(0, end).toString("utf8").split("\r\n");
    buf = buf.slice(end + 4);
    status = Number(lines[0].split(" ")[1]);
    headers = {};
    for (const line of lines.slice(1)) {
      const i = line.indexOf(":");
      if (i === -1) continue;
      const name = line.slice(0, i).toLowerCase();
      const value = line.slice(i + 1).trim();
      headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
    }
  }
  return { status, headers, body: buf };
}

// Size-only: compressed bytes on the wire for one asset.
function fetchSizeBr(target) {
  const out = execFileSync(
    "curl",
    [
      "-sL",
      "--max-time",
      "30",
      "-A",
      "perf-ratchet",
      "-H",
      "Accept-Encoding: br",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code} %{size_download}",
      target,
    ],
    { encoding: "utf8" }
  );
  const [code, size] = out.trim().split(" ").map(Number);
  if (code !== 200) throw new Error(`HTTP ${code}`);
  return size;
}

let res;
try {
  res = fetchBr(url);
} catch (err) {
  console.error(`FAIL: could not fetch ${url}: ${err.message}`);
  process.exit(1);
}
if (res.status !== 200) {
  console.error(`FAIL: ${url} returned HTTP ${res.status}`);
  process.exit(1);
}

const encoding = res.headers["content-encoding"] ?? "identity";
let html;
try {
  html = encoding.includes("br")
    ? brotliDecompressSync(res.body).toString("utf8")
    : encoding.includes("gzip")
      ? gunzipSync(res.body).toString("utf8")
      : res.body.toString("utf8");
} catch (err) {
  console.error(`FAIL: could not decode ${encoding} body from ${url}: ${err.message}`);
  process.exit(1);
}
if (html.length < 1000) {
  console.error(`FAIL: ${url} returned suspiciously little HTML (${html.length} bytes)`);
  process.exit(1);
}

let failed = false;
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  failed = true;
};

// HTML_BUDGET — compressed HTML on the wire.
const htmlBytes = res.body.length;
if (htmlBytes > HTML_BUDGET) {
  fail(`HTML ${htmlBytes} bytes (${encoding}) exceeds budget ${HTML_BUDGET}`);
} else {
  console.log(`PASS: HTML ${htmlBytes} bytes (${encoding}) ≤ ${HTML_BUDGET}`);
}

const scriptUrls = [
  ...new Set(
    [...html.matchAll(/<script[^>]*\ssrc="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1])
  ),
];

// CHUNK_BUDGET — script count. Zero scripts means this isn't a real app render
// (error page or challenge interstitial served as 200) — never a pass.
if (scriptUrls.length === 0) {
  fail(`homepage HTML contains no /_next/static scripts — not a real app render`);
} else if (scriptUrls.length > CHUNK_BUDGET) {
  fail(`${scriptUrls.length} script chunks exceeds budget ${CHUNK_BUDGET}`);
} else {
  console.log(`PASS: ${scriptUrls.length} script chunks ≤ ${CHUNK_BUDGET}`);
}

// JS_BUDGET — sum of compressed chunk sizes.
let jsBytes = 0;
for (const src of scriptUrls) {
  try {
    jsBytes += fetchSizeBr(origin + src);
  } catch (err) {
    fail(`could not fetch chunk ${src}: ${err.message}`);
  }
}
if (jsBytes > JS_BUDGET) {
  fail(`JS ${jsBytes} compressed bytes across ${scriptUrls.length} chunks exceeds budget ${JS_BUDGET}`);
} else {
  console.log(`PASS: JS ${jsBytes} compressed bytes across ${scriptUrls.length} chunks ≤ ${JS_BUDGET}`);
}

// NO_SET_COOKIE — an anonymous 200 with set-cookie is ineligible for Cloudflare edge cache.
if (res.headers["set-cookie"]) {
  fail(`anonymous GET ${url} carries set-cookie (breaks edge-cache eligibility)`);
} else {
  console.log(`PASS: no set-cookie on anonymous GET ${url}`);
}

// EDGE_HIT — second fetch should come from Cloudflare's cache.
let cfStatus = "(fetch failed)";
try {
  cfStatus = fetchBr(url).headers["cf-cache-status"] ?? "(none)";
} catch {
  // WARN path below reports it.
}
if (cfStatus === "HIT") {
  console.log(`PASS: cf-cache-status=HIT on second fetch`);
} else if (ENFORCE_EDGE_HIT) {
  fail(`cf-cache-status=${cfStatus} on second fetch (expected HIT)`);
} else {
  console.log(`WARN: cf-cache-status=${cfStatus} on second fetch (not enforced yet)`);
}

if (failed) process.exit(1);
console.log(`OK: perf budget green for ${url}`);
