// Secret-address privacy ratchet: fails if a secret event's address leaks to
// anonymous viewers through the page HTML/RSC payload or the Supabase REST API.
// Relies on a permanent canary event whose private address is a sentinel string.
// Run post-deploy: node scripts/check-secret-address.mjs [slug]
import { execFileSync } from "child_process";
import { readFileSync } from "fs";

const slug = process.argv[2] ?? "canary-secret-address";
const SENTINEL = "CANARY-SECRET-ADDR-7719";

// Supabase anon credentials: env first, .env.local fallback
function envVar(name) {
  if (process.env[name]) return process.env[name];
  try {
    const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const match = envFile.match(new RegExp(`^${name}="?([^"\\n]+)"?$`, "m"));
    return match?.[1];
  } catch {
    return undefined;
  }
}

const supabaseUrl = envVar("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = envVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!supabaseUrl || !anonKey) {
  console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not found");
  process.exit(1);
}

function curl(url, headers = []) {
  const args = ["-sL", "--max-time", "30", "-A", "secret-address-ratchet"];
  for (const h of headers) args.push("-H", h);
  args.push(url);
  return execFileSync("curl", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

let failed = false;
const anonHeaders = [`apikey: ${anonKey}`, `Authorization: Bearer ${anonKey}`];

// 1. Event page (HTML + RSC payload) must not contain the sentinel
const pageUrl = `https://dalat.app/en/events/${slug}`;
const html = curl(pageUrl);
if (!html || html.length < 1000) {
  console.error(`FAIL: ${pageUrl} returned suspiciously little HTML (${html?.length ?? 0} bytes) — canary event missing?`);
  failed = true;
} else if (html.includes(SENTINEL)) {
  console.error(`FAIL: sentinel address leaked into ${pageUrl}`);
  failed = true;
}

// 2. events REST row must not carry the sentinel (public columns are NULLed)
const eventsRest = curl(
  `${supabaseUrl}/rest/v1/events?slug=eq.${slug}&select=*`,
  anonHeaders
);
if (eventsRest.includes(SENTINEL)) {
  console.error("FAIL: sentinel address leaked through the events REST API");
  failed = true;
}
const eventRows = JSON.parse(eventsRest || "[]");
if (!Array.isArray(eventRows) || eventRows.length === 0) {
  console.error("FAIL: canary event not found via REST — ratchet cannot verify");
  failed = true;
} else if (eventRows[0].address !== null || eventRows[0].latitude !== null || eventRows[0].google_maps_url !== null) {
  console.error("FAIL: canary event has non-NULL public location columns");
  failed = true;
}

// 3. event_private_details must be invisible to anon (RLS)
const privateRest = curl(
  `${supabaseUrl}/rest/v1/event_private_details?select=*`,
  anonHeaders
);
if (privateRest.includes(SENTINEL)) {
  console.error("FAIL: sentinel address leaked through the event_private_details REST API");
  failed = true;
}
let privateRows = [];
try {
  privateRows = JSON.parse(privateRest);
} catch {
  // non-JSON (e.g. RLS error object) is fine as long as no sentinel above
}
if (Array.isArray(privateRows) && privateRows.length > 0) {
  console.error(`FAIL: anon can read ${privateRows.length} row(s) from event_private_details`);
  failed = true;
}

if (failed) process.exit(1);
console.log(`OK: secret address stays secret (page, events REST, private-details REST) for ${slug}`);
