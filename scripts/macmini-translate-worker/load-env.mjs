// Preloaded with `node --import` by run.sh. Reads secrets inside the node
// process so they never travel through a shell export, a launchd plist, or a
// command line (`npx`/`npm exec` rewrote its process title over the
// environment block, which then showed up in `ps`).
//
// WORKER_ENV_FILE: Vercel-CLI style .env file (values double-quoted, some
// with a literal trailing \n). It must be mode 600; anything looser aborts.
// LOCAL_AI_TOKEN_FILE: optional file holding LOCAL_AI_TOKEN.
import { readFileSync, statSync } from "node:fs";

function readPrivate(path, label) {
  const mode = statSync(path).mode & 0o777;
  if (mode & 0o077) {
    console.error(`FATAL: ${label} ${path} is mode ${mode.toString(8)}; run chmod 600`);
    process.exit(1);
  }
  return readFileSync(path, "utf8");
}

export function parseVercelEnv(text) {
  const out = {};
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1);
    if (val.startsWith('"')) val = val.slice(1);
    if (val.endsWith('"')) val = val.slice(0, -1);
    if (val.endsWith("\\n")) val = val.slice(0, -2);
    out[key] = val;
  }
  return out;
}

const envFile = process.env.WORKER_ENV_FILE;
if (envFile) {
  const parsed = parseVercelEnv(readPrivate(envFile, "WORKER_ENV_FILE"));
  // Values set by launchd/run.sh (CLAUDE_ENABLED, REDO_BEFORE, ...) win.
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
const tokenFile = process.env.LOCAL_AI_TOKEN_FILE;
if (tokenFile && !process.env.LOCAL_AI_TOKEN) {
  try {
    process.env.LOCAL_AI_TOKEN = readPrivate(tokenFile, "LOCAL_AI_TOKEN_FILE").trim();
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
}
// run.sh lists keys that a disabled path must not see, even if .env.local
// defines them (e.g. LOCAL_AI_URL when LOCAL_AI_ENABLED=0).
for (const k of (process.env.WORKER_UNSET ?? "").split(/\s+/).filter(Boolean)) delete process.env[k];
delete process.env.WORKER_UNSET;
delete process.env.WORKER_ENV_FILE;
delete process.env.LOCAL_AI_TOKEN_FILE;
