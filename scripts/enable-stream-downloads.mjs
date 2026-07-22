/**
 * One-time backfill: enable the downloadable MP4 rendition for every
 * Cloudflare Stream video referenced by a moment.
 *
 * The POST is idempotent — already-enabled videos just report their status.
 * Safe to re-run.
 *
 * Usage: node scripts/enable-stream-downloads.mjs
 */
import { readFileSync } from "node:fs";

function env(key) {
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing from .env.local`);
  // Values may be quoted and carry a literal trailing \n
  return line
    .slice(key.length + 1)
    .replace(/\\n/g, "")
    .replace(/^"|"$/g, "")
    .trim();
}

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const CF_ACCOUNT = env("CLOUDFLARE_ACCOUNT_ID");
const CF_TOKEN = env("CLOUDFLARE_STREAM_API_TOKEN");

// All moments with a Stream video, any status — drafts become published later
const res = await fetch(
  `${SUPABASE_URL}/rest/v1/moments?select=id,cf_video_uid&cf_video_uid=not.is.null&content_type=eq.video`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
);
if (!res.ok) throw new Error(`moments fetch failed: ${res.status}`);
const moments = await res.json();
const uids = [...new Set(moments.map((m) => m.cf_video_uid))];
console.log(`${moments.length} video moments, ${uids.length} unique stream videos`);

let ready = 0,
  inprogress = 0,
  failed = 0;

for (const [i, uid] of uids.entries()) {
  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/stream/${uid}/downloads`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${CF_TOKEN}` },
      }
    );
    const data = await r.json();
    if (!data.success) {
      failed++;
      console.error(`✗ ${uid}: ${data.errors?.map((e) => e.message).join(", ")}`);
    } else if (data.result?.default?.status === "ready") {
      ready++;
    } else {
      inprogress++;
    }
  } catch (err) {
    failed++;
    console.error(`✗ ${uid}: ${err.message}`);
  }
  if ((i + 1) % 50 === 0) console.log(`…${i + 1}/${uids.length}`);
}

console.log(`done: ${ready} ready, ${inprogress} encoding, ${failed} failed`);
