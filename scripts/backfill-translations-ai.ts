/**
 * Bulk translation backfill — run ON the Mac mini for full local speed.
 *
 * Translator preference per item:
 *
 *   1. `claude -p` (subscription Haiku via CLAUDE_BIN) — one session per
 *      content item translates ALL missing locales at once. Native-quality
 *      output in every locale; zero pay-per-token keys. Only works from a
 *      launchd GUI session (keychain creds) — see scripts/macmini-translate-worker/.
 *   2. The free AI provider chain (local qwen3 -> CF Llama -> OpenRouter)
 *      per locale, as before — used when CLAUDE_BIN is unset or claude is
 *      quota-limited/offline.
 *
 * Modes (all idempotent — upserts per (content, locale, field)):
 *   - Sweep: fills missing 12-locale coverage via lib/translation-sweep.ts
 *     (shared with the translate-pending cron). SCAN_LIMIT bounds how many
 *     newest items per content type are considered.
 *   - Redo: re-translates existing 'auto' rows whose updated_at falls in
 *     [REDO_SINCE, REDO_BEFORE) — the window of low-quality qwen3/Llama
 *     output — by upserting better text over them. Claude-only: redoing
 *     with the same weak models would be pointless. Rows it rewrites leave
 *     the window (updated_at moves past REDO_BEFORE), so restarts resume
 *     where they left off with no local state.
 *   - RUN_FOREVER=1: after draining both, keep polling every POLL_MINUTES
 *     so new content gets claude-quality translations before the 2-hourly
 *     cron falls back to qwen3.
 *
 * Laptop usage (unchanged, provider chain only):
 *   LOCAL_AI_URL=http://127.0.0.1:11501 LOCAL_AI_TOKEN=$(cat ~/dalat-ai-proxy/secret.txt) \
 *     npx tsx --tsconfig tsconfig.json scripts/backfill-translations-ai.ts
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  translateFieldsToLocale,
  detectLanguage,
  TRANSLATE_SYSTEM,
  LOCALE_NAMES,
} from "@/lib/google-translate";
import {
  collectTranslationWork,
  CAPTION_FIELDS,
  TranslationWorkItem,
} from "@/lib/translation-sweep";
import { CONTENT_LOCALES, ContentLocale } from "@/lib/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aljcmodwjqlznzcydyor.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SCAN_LIMIT = Number(process.env.SCAN_LIMIT) || 200;

const CLAUDE_BIN = process.env.CLAUDE_BIN || "";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
const CLAUDE_TIMEOUT_MS = (Number(process.env.CLAUDE_TIMEOUT_MINUTES) || 10) * 60 * 1000;
const QUOTA_BACKOFF_MS = (Number(process.env.QUOTA_BACKOFF_MINUTES) || 30) * 60 * 1000;
// Empty cwd so headless claude doesn't ingest a repo's CLAUDE.md per call
const CLAUDE_CWD = "/tmp/dalat-translate";

const RUN_FOREVER = process.env.RUN_FOREVER === "1";
const POLL_MINUTES = Number(process.env.POLL_MINUTES) || 10;
const REDO_SINCE = process.env.REDO_SINCE || "";
const REDO_BEFORE = process.env.REDO_BEFORE || "";
const REDO_CHUNK = Number(process.env.REDO_CHUNK) || 100;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rows written this process — used to detect zero-progress rounds so a
 * dead provider chain can't hot-loop the sweep (the Jul 9–21 wedge mode). */
let rowsWritten = 0;

// ── claude -p translator ────────────────────────────────────────────────

/** "claude is temporarily unusable" — quota window, expired login, network. */
function looksUnavailable(text: string): boolean {
  return /rate.?limit|quota|usage limit|limit reached|overloaded|too many requests|429|not logged in|\/login|unauthorized|authentication|ENOTFOUND|ECONNREFUSED|fetch failed/i.test(
    text || ""
  );
}

let claudeDownUntil = 0;
let claudeDownSince = 0;
let claudeConsecutiveDown = 0;
function claudeAvailable(): boolean {
  return Boolean(CLAUDE_BIN) && Date.now() >= claudeDownUntil;
}

class ClaudeUnavailable extends Error {}

function markClaudeDown(detail: string): ClaudeUnavailable {
  claudeDownUntil = Date.now() + QUOTA_BACKOFF_MS;
  if (!claudeDownSince) claudeDownSince = Date.now();
  claudeConsecutiveDown++;
  const since = new Date(claudeDownSince).toISOString();
  // Loud on purpose: fallback rows written during a claude outage get
  // updated_at > REDO_BEFORE and will NEVER be auto-redone. The operator
  // needs the outage start time to re-pin the redo window after recovery.
  console.error(
    `[claude] DOWN since ${since} (${claudeConsecutiveDown} consecutive backoffs) — ` +
      `fallback rows written after ${since} will NOT be auto-redone; ` +
      `after recovery, re-pin REDO_BEFORE past the recovery time and restart. Detail: ${detail}`
  );
  return new ClaudeUnavailable(`claude unavailable: ${detail}`);
}

function runClaude(prompt: string): string {
  const result = spawnSync(CLAUDE_BIN, ["-p", "--model", CLAUDE_MODEL], {
    input: prompt,
    encoding: "utf8",
    timeout: CLAUDE_TIMEOUT_MS,
    cwd: CLAUDE_CWD,
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();
  // A spawn-level error (ENOENT bad path, ETIMEDOUT hang, EACCES) means the
  // CLI never answered — that's unavailability, not a per-item failure.
  if (result.error) throw markClaudeDown(String(result.error));
  if (result.status !== 0 || !stdout) {
    const detail = `${stderr} ${stdout}`.trim().slice(0, 400);
    if (looksUnavailable(detail)) throw markClaudeDown(detail);
    throw new Error(`claude failed (status ${result.status}): ${detail}`);
  }
  claudeDownSince = 0;
  claudeConsecutiveDown = 0;
  return stdout;
}

function parseJsonLoose<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`no JSON object in claude output: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1)) as T;
}

/** Locales per claude call — long content gets fewer to protect quality. */
function localeChunkSize(totalChars: number): number {
  if (totalChars > 4000) return 1;
  if (totalChars > 1500) return 3;
  return CONTENT_LOCALES.length;
}

/**
 * Translate one content item into every locale in `locales` via claude.
 * Returns { locale: { field_name: text } } — a locale missing from the
 * result simply wasn't produced and stays pending for fallback/retry.
 */
function claudeTranslateItem(
  fields: { field_name: string; text: string }[],
  locales: ContentLocale[],
  sourceLocale: ContentLocale
): Partial<Record<ContentLocale, Record<string, string>>> {
  const input: Record<string, string> = {};
  for (const f of fields) input[f.field_name] = f.text;
  const totalChars = fields.reduce((n, f) => n + f.text.length, 0);

  const out: Partial<Record<ContentLocale, Record<string, string>>> = {};
  const size = localeChunkSize(totalChars);
  for (let i = 0; i < locales.length; i += size) {
    const chunk = locales.slice(i, i + size);
    const names = chunk.map((l) => `${l} (${LOCALE_NAMES[l]})`).join(", ");
    const prompt =
      `${TRANSLATE_SYSTEM}\n\n` +
      `Translate every value of INPUT from ${LOCALE_NAMES[sourceLocale] ?? sourceLocale} into each of these languages: ${names}.\n` +
      `Respond with ONLY a JSON object — no prose, no markdown fences — of the shape ` +
      `{"<locale code>": {<the same keys as INPUT, with translated values>}} covering exactly these locale codes: ${chunk.join(", ")}.\n\n` +
      `INPUT:\n${JSON.stringify(input)}`;

    // One bad chunk must not throw away the chunks that already succeeded —
    // a long item is many claude calls, and completed Haiku work is paid for.
    let parsed: Record<string, Record<string, string>>;
    try {
      parsed = parseJsonLoose<Record<string, Record<string, string>>>(runClaude(prompt));
    } catch (err) {
      console.error(`  ✗ claude chunk [${chunk.join(",")}]: ${String(err).slice(0, 200)}`);
      if (err instanceof ClaudeUnavailable) break; // remaining chunks would fail the same way
      continue;
    }
    const unexpected = Object.keys(parsed).filter((k) => !(chunk as string[]).includes(k));
    if (unexpected.length > 0) {
      // Mismatched locale keys ("zh-CN" for "zh") would otherwise read as
      // "model produced nothing" — surface the signature explicitly.
      console.warn(`  ⚠ claude returned unexpected locale keys: ${unexpected.join(",")} (wanted ${chunk.join(",")})`);
    }
    for (const locale of chunk) {
      const values = parsed[locale];
      if (!values || typeof values !== "object") continue;
      const clean: Record<string, string> = {};
      for (const f of fields) {
        const t = values[f.field_name];
        if (typeof t === "string" && t.trim()) clean[f.field_name] = t.trim();
      }
      if (Object.keys(clean).length > 0) out[locale] = clean;
    }
  }
  return out;
}

// ── shared upsert ───────────────────────────────────────────────────────

async function upsertLocale(
  item: TranslationWorkItem,
  src: ContentLocale,
  locale: ContentLocale,
  translated: Record<string, string>
): Promise<void> {
  const inserts = item.fields
    .filter((f) => translated[f.field_name])
    .map((f) => ({
      content_type: item.contentType,
      content_id: item.contentId,
      source_locale: src,
      target_locale: locale,
      field_name: f.field_name,
      translated_text: translated[f.field_name],
      translation_status: "auto",
    }));
  if (inserts.length) {
    const { error } = await supabase.from("content_translations").upsert(inserts, {
      onConflict: "content_type,content_id,target_locale,field_name",
    });
    if (error) throw error;
    rowsWritten += inserts.length;
  }
}

/**
 * Translate `item` into item.missingLocales. Claude-first (all locales in
 * one session); provider-chain fallback per locale when allowed.
 */
async function processItem(item: TranslationWorkItem, allowFallback: boolean): Promise<void> {
  const src = item.sourceLocale ?? (await detectLanguage(item.fields[0].text));
  const tag = `${item.contentType}:${item.contentId.slice(0, 8)}`;
  let pending = item.missingLocales.slice();

  // Source language needs no model round-trip
  if (pending.includes(src)) {
    const copy = Object.fromEntries(item.fields.map((f) => [f.field_name, f.text]));
    await upsertLocale(item, src, src, copy);
    pending = pending.filter((l) => l !== src);
    console.log(`  ✓ ${tag} ${src} (copy-through)`);
  }
  if (pending.length === 0) return;

  if (claudeAvailable()) {
    const t0 = Date.now();
    try {
      const translated = claudeTranslateItem(item.fields, pending, src);
      const done: ContentLocale[] = [];
      for (const locale of pending) {
        if (translated[locale]) {
          await upsertLocale(item, src, locale, translated[locale]!);
          done.push(locale);
        }
      }
      pending = pending.filter((l) => !done.includes(l));
      if (done.length > 0) {
        console.log(`  ✓ ${tag} [${done.join(",")}] (claude, ${Math.round((Date.now() - t0) / 1000)}s)`);
      } else {
        // Never print a checkmark for quota spent with nothing written
        console.error(`  ✗ ${tag} claude produced 0 of ${pending.length} locales (${Math.round((Date.now() - t0) / 1000)}s)`);
      }
    } catch (err) {
      console.error(`  ✗ ${tag} claude: ${String(err).slice(0, 200)}`);
    }
  }

  if (pending.length > 0 && allowFallback) {
    for (const locale of pending) {
      const t0 = Date.now();
      try {
        const translated = await translateFieldsToLocale(item.fields, locale);
        await upsertLocale(item, src, locale, translated);
        console.log(`  ✓ ${tag} ${locale} (fallback-chain, ${Math.round((Date.now() - t0) / 1000)}s)`);
      } catch (err) {
        console.error(`  ✗ ${tag} ${locale}: ${String(err).slice(0, 150)}`);
      }
    }
  }
}

// ── redo: upgrade the low-quality window in place ───────────────────────

interface RedoGroup {
  contentType: "blog" | "event" | "moment";
  contentId: string;
  locales: Set<ContentLocale>;
  fieldNames: Set<string>;
}

/** The content types buildRedoItems can rebuild — the sweep's three.
 * Other types in content_translations (venue, track, comment, profile,
 * organizer) have their own pipelines and are deliberately out of scope. */
const REDO_CONTENT_TYPES = ["blog", "event", "moment"] as const;

/** Page the suspect rows and group them per content item. */
async function collectRedoGroups(): Promise<RedoGroup[]> {
  const groups = new Map<string, RedoGroup>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data: rows, error } = await supabase
      .from("content_translations")
      .select("content_type, content_id, source_locale, target_locale, field_name")
      .eq("translation_status", "auto")
      .in("content_type", REDO_CONTENT_TYPES as unknown as string[])
      .gte("updated_at", REDO_SINCE)
      .lt("updated_at", REDO_BEFORE)
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`[redo] row scan failed: ${error.message}`);
    for (const row of rows ?? []) {
      if (row.target_locale === row.source_locale) continue; // copy-throughs are already exact
      const key = `${row.content_type}:${row.content_id}`;
      const g =
        groups.get(key) ??
        ({ contentType: row.content_type, contentId: row.content_id, locales: new Set(), fieldNames: new Set() } as RedoGroup);
      g.locales.add(row.target_locale as ContentLocale);
      g.fieldNames.add(row.field_name);
      groups.set(key, g);
    }
    if (!rows || rows.length < PAGE) break;
  }
  return [...groups.values()];
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const CAPTION_FIELD_SET = new Set<string>(CAPTION_FIELDS);
const MAX_FIELD_LENGTH = 5000;
const cap = (t: string) => (t.length > MAX_FIELD_LENGTH ? t.slice(0, MAX_FIELD_LENGTH) : t);

/** Rebuild TranslationWorkItems (source text + target locales) for redo groups. */
async function buildRedoItems(groups: RedoGroup[]): Promise<TranslationWorkItem[]> {
  const byType = (t: RedoGroup["contentType"]) => groups.filter((g) => g.contentType === t);
  const items: TranslationWorkItem[] = [];

  for (const ids of chunk(byType("event").map((g) => g.contentId), 50)) {
    const { data, error } = await supabase.from("events").select("id, title, description, source_locale").in("id", ids);
    if (error) throw new Error(`[redo] events fetch failed: ${error.message}`);
    for (const e of data ?? []) {
      const g = groups.find((x) => x.contentType === "event" && x.contentId === e.id)!;
      const fields = [
        { field_name: "title", text: e.title },
        { field_name: "description", text: e.description },
      ].filter((f) => f.text?.trim());
      if (fields.length)
        items.push({ contentType: "event", contentId: e.id, sourceLocale: e.source_locale, fields, missingLocales: [...g.locales] });
    }
  }

  const momentGroups = byType("moment");
  for (const ids of chunk(momentGroups.map((g) => g.contentId), 50)) {
    const [{ data: moments, error: mErr }, { data: meta, error: metaErr }] = await Promise.all([
      supabase.from("moments").select("id, text_content, source_locale").in("id", ids),
      supabase.from("moment_metadata").select(`moment_id, ${CAPTION_FIELDS.join(", ")}`).in("moment_id", ids),
    ]);
    if (mErr) throw new Error(`[redo] moments fetch failed: ${mErr.message}`);
    if (metaErr) throw new Error(`[redo] moment_metadata fetch failed: ${metaErr.message}`);
    const metaById = new Map(
      ((meta ?? []) as unknown as Array<Record<string, string | null>>).map((r) => [r.moment_id, r])
    );
    for (const id of ids) {
      const g = momentGroups.find((x) => x.contentId === id)!;
      const m = (moments ?? []).find((x) => x.id === id);
      // User-written text: source = the author's language
      if (g.fieldNames.has("text_content") && m?.text_content?.trim()) {
        items.push({
          contentType: "moment",
          contentId: id,
          sourceLocale: m.source_locale,
          fields: [{ field_name: "text_content", text: m.text_content }],
          missingLocales: [...g.locales],
        });
      }
      // Machine captions: always English source
      const metaRow = metaById.get(id);
      if (metaRow) {
        const fields = [...g.fieldNames]
          .filter((n) => CAPTION_FIELD_SET.has(n) && (metaRow[n] ?? "").trim())
          .map((n) => ({ field_name: n, text: cap(metaRow[n]!) }));
        if (fields.length)
          items.push({ contentType: "moment", contentId: id, sourceLocale: "en", fields, missingLocales: [...g.locales] });
      }
    }
  }

  for (const ids of chunk(byType("blog").map((g) => g.contentId), 50)) {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("id, title, story_content, technical_content, meta_description, source_locale")
      .in("id", ids);
    if (error) throw new Error(`[redo] blog fetch failed: ${error.message}`);
    for (const p of data ?? []) {
      const g = groups.find((x) => x.contentType === "blog" && x.contentId === p.id)!;
      const fields = [
        { field_name: "title", text: p.title },
        { field_name: "story_content", text: p.story_content },
        { field_name: "technical_content", text: p.technical_content },
        { field_name: "meta_description", text: p.meta_description },
      ].filter((f) => f.text?.trim());
      if (fields.length)
        items.push({ contentType: "blog", contentId: p.id, sourceLocale: p.source_locale, fields, missingLocales: [...g.locales] });
    }
  }

  return items;
}

/** Groups that can't make progress (deleted content, repeated failures) —
 * skipped for the rest of this process so they can't clog the queue head.
 * Recomputed from scratch on restart, which is the retry mechanism. */
const redoAttempts = new Map<string, number>();
const MAX_REDO_ATTEMPTS = 3;
const redoKey = (g: RedoGroup) => `${g.contentType}:${g.contentId}`;

/**
 * Redo one chunk of the suspect window. Returns how many workable groups
 * remain (processed groups leave the window as their rows' updated_at
 * moves past REDO_BEFORE via upsert).
 */
async function redoChunk(): Promise<number> {
  const all = await collectRedoGroups();
  const groups = all.filter((g) => (redoAttempts.get(redoKey(g)) ?? 0) < MAX_REDO_ATTEMPTS);
  if (groups.length === 0) {
    if (all.length > 0) console.log(`[redo] ${all.length} groups left but all exhausted ${MAX_REDO_ATTEMPTS} attempts — restart to retry`);
    return 0;
  }
  if (!claudeAvailable()) {
    console.log(`[redo] ${groups.length} groups pending but claude unavailable — waiting (no point redoing with qwen3)`);
    await sleep(5 * 60_000);
    return groups.length;
  }
  const batch = groups.slice(0, REDO_CHUNK);
  console.log(`[redo] ${groups.length} content groups in window; upgrading ${batch.length} now`);
  const items = await buildRedoItems(batch);
  // Only charge an attempt to groups we actually engage with: orphans
  // (deleted content — no item produced, would clog the queue head forever)
  // and groups whose items we process. Groups skipped by a quota break are
  // NOT charged — they were never attempted.
  const charged = new Set<string>();
  const charge = (key: string) => {
    if (charged.has(key)) return;
    charged.add(key);
    redoAttempts.set(key, (redoAttempts.get(key) ?? 0) + 1);
  };
  const itemKeys = new Set(items.map((it) => `${it.contentType}:${it.contentId}`));
  for (const g of batch) if (!itemKeys.has(redoKey(g))) charge(redoKey(g));
  for (const item of items) {
    if (!claudeAvailable()) break; // quota hit mid-chunk — resume next cycle
    const key = `${item.contentType}:${item.contentId}`;
    charge(key);
    await processItem(item, false);
    if (!claudeAvailable()) {
      // claude died DURING this item — that's an outage, not an item
      // failure. Refund the attempt so outages can't exhaust live groups.
      redoAttempts.set(key, Math.max(0, (redoAttempts.get(key) ?? 1) - 1));
    }
  }
  return groups.length;
}

// ── main ────────────────────────────────────────────────────────────────

async function main() {
  if (CLAUDE_BIN) mkdirSync(CLAUDE_CWD, { recursive: true });
  const redoConfigured = Boolean(REDO_SINCE && REDO_BEFORE);
  if (redoConfigured && (isNaN(Date.parse(REDO_SINCE)) || isNaN(Date.parse(REDO_BEFORE)))) {
    // An unpinned plist placeholder would otherwise crash-loop under
    // launchd, re-running the full sweep scan every restart.
    console.error(`FATAL: REDO_SINCE/REDO_BEFORE not valid timestamps: "${REDO_SINCE}" / "${REDO_BEFORE}"`);
    process.exit(1);
  }
  console.log(
    `[backfill] claude=${CLAUDE_BIN ? CLAUDE_MODEL : "off"} scan_limit=${SCAN_LIMIT} ` +
      `redo=${redoConfigured ? `[${REDO_SINCE} .. ${REDO_BEFORE})` : "off"} forever=${RUN_FOREVER}`
  );

  let round = 0;
  while (true) {
    const work = await collectTranslationWork(supabase, SCAN_LIMIT);
    if (work.length > 0) {
      round++;
      const units = work.reduce((n, w) => n + w.missingLocales.length, 0);
      console.log(`Round ${round}: ${work.length} items, ${units} locale-units pending`);
      const before = rowsWritten;
      for (const item of work) await processItem(item, true);
      if (rowsWritten === before) {
        // Every translator failed for every item — back off instead of
        // hammering the same dead providers in a tight loop. Run a redo
        // chunk first: one permanently stuck sweep item must not hold
        // the redo hostage forever.
        console.error(`[backfill] round ${round} made zero progress — redo chunk, then sleeping ${POLL_MINUTES}m`);
        if (redoConfigured) await redoChunk();
        await sleep(POLL_MINUTES * 60 * 1000);
      }
      continue; // re-check coverage before touching redo
    }

    const redoRemaining = redoConfigured ? await redoChunk() : 0;
    if (redoRemaining > 0) continue;

    if (!RUN_FOREVER) {
      console.log("Backfill complete — no pending items.");
      break;
    }
    await sleep(POLL_MINUTES * 60 * 1000);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
