import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { ingestScoutSubmission } from "@/lib/activity-graph/scout-submit";

loadEnv({
  path: process.env.ACTIVITY_GRAPH_ENV_FILE ?? ".env.local",
  quiet: true,
});

function supabaseRootUrl(value: string): string {
  const url = new URL(value);
  // Supabase REST is rooted at the project origin. This also tolerates an
  // accidental trailing path in a local Vercel env export.
  if (url.hostname.endsWith(".supabase.co")) {
    url.pathname = "";
    url.search = "";
    url.hash = "";
  }
  return url.toString();
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("Read one JSON object or an array of objects from stdin. See docs/activity-graph-autonomous-scout.md.");
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are required");
  const body = (await readStdin()).trim();
  if (!body) throw new Error("Expected scout submission JSON on stdin");
  const parsed: unknown = JSON.parse(body);
  const supabase = createClient(supabaseRootUrl(url), key, { auth: { persistSession: false, autoRefreshToken: false } });
  const results = [];
  for (const submission of Array.isArray(parsed) ? parsed : [parsed]) {
    results.push(await ingestScoutSubmission(supabase, submission));
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
