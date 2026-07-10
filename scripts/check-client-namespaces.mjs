// Client i18n namespace guard: the [locale] layout passes only CLIENT_NAMESPACES
// to NextIntlClientProvider (instead of the full ~97KB messages/en.json).
// This script collects useTranslations() namespaces from ALL scanned files —
// not just "use client" ones, because a directive-less file becomes a client
// module the moment a client file imports it — and fails the build if:
//   - a namespace a client component needs is missing from lib/i18n/client-namespaces.ts
//   - a namespace can't be statically determined (dynamic arg) — fail closed
//   - a client file uses getTranslations or useMessages (invalid / needs full messages)
//   - useTranslations is aliased or re-exported (would bypass this scan) — fail closed
//   - a scan dir is missing, or suspiciously few namespaces were collected (vacuous pass)
//   - a declared namespace is missing from any of the 12 messages/*.json locale files
// Only getTranslations (async, server-only) usage is safe to leave out of the list.
// Run: node scripts/check-client-namespaces.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const NAMESPACES_FILE = join(ROOT, "lib/i18n/client-namespaces.ts");

const errors = [];
const required = new Set();

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) yield full;
  }
}

function isClientFile(src) {
  return /^(?:\s|\/\/[^\n]*\n?|\/\*[\s\S]*?\*\/)*(['"])use client\1/.test(src);
}

// Strip comments but preserve line numbers (block comments -> newlines).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/^\s*\/\/.*$/gm, "");
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

// Parse the first argument starting at src[i] (after an open paren).
// Returns { kind: "none" } for `)`, { kind: "literal", value } for a fully
// literal string, { kind: "prefix", value } for a template literal whose text
// before the first ${ is literal, or { kind: "dynamic" }.
function parseFirstArg(src, i) {
  while (i < src.length && /\s/.test(src[i])) i++;
  const ch = src[i];
  if (ch === ")") return { kind: "none" };
  if (ch === '"' || ch === "'") {
    let value = "";
    for (let j = i + 1; j < src.length; j++) {
      if (src[j] === "\\") {
        value += src[j + 1];
        j++;
      } else if (src[j] === ch) {
        return { kind: "literal", value };
      } else {
        value += src[j];
      }
    }
    return { kind: "dynamic" };
  }
  if (ch === "`") {
    let value = "";
    for (let j = i + 1; j < src.length; j++) {
      if (src[j] === "\\") {
        value += src[j + 1];
        j++;
      } else if (src[j] === "$" && src[j + 1] === "{") {
        return { kind: "prefix", value };
      } else if (src[j] === "`") {
        return { kind: "literal", value };
      } else {
        value += src[j];
      }
    }
    return { kind: "dynamic" };
  }
  return { kind: "dynamic" };
}

function firstSegment(key) {
  return key.split(".")[0];
}

for (const dir of SCAN_DIRS) {
  // A renamed/missing scan dir would silently drop every file in it from the
  // required set and let the guard pass vacuously — fail hard instead.
  let dirStat;
  try {
    dirStat = statSync(join(ROOT, dir));
  } catch {
    dirStat = null;
  }
  if (!dirStat?.isDirectory()) {
    console.error(`check-client-namespaces: scan dir "${dir}" is missing or not a directory`);
    process.exit(1);
  }

  for (const file of walk(join(ROOT, dir))) {
    const raw = readFileSync(file, "utf8");
    const src = stripComments(raw);
    const rel = relative(ROOT, file);

    // Aliasing or re-exporting useTranslations bypasses the call-site scan below
    const aliasRe = /\buseTranslations\s+as\s+[A-Za-z_$]|\bexport\s*\{[^}]*\buseTranslations\b[^}]*\}/g;
    let a;
    while ((a = aliasRe.exec(src))) {
      errors.push(`${rel}:${lineOf(src, a.index)} — useTranslations aliased or re-exported (bypasses namespace scan; fail closed)`);
    }

    if (isClientFile(raw)) {
      for (const fn of ["getTranslations", "useMessages"]) {
        const re = new RegExp(String.raw`\b${fn}\b`, "g");
        let m;
        while ((m = re.exec(src))) {
          errors.push(`${rel}:${lineOf(src, m.index)} — ${fn} in a "use client" file`);
        }
      }
    }

    const bareBindings = new Set();
    const hookRe = /\buseTranslations\s*\(/g;
    let m;
    while ((m = hookRe.exec(src))) {
      const line = lineOf(src, m.index);
      const arg = parseFirstArg(src, m.index + m[0].length);
      if (arg.kind === "none") {
        const before = src.slice(Math.max(0, m.index - 120), m.index);
        const binding = before.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/);
        if (!binding) {
          errors.push(`${rel}:${line} — bare useTranslations() without a trackable binding`);
        } else {
          bareBindings.add(binding[1]);
        }
      } else if (arg.kind === "literal" && arg.value) {
        required.add(firstSegment(arg.value));
      } else if (arg.kind === "prefix" && arg.value.includes(".")) {
        required.add(firstSegment(arg.value));
      } else {
        errors.push(`${rel}:${line} — non-literal useTranslations() namespace (fail closed)`);
      }
    }

    for (const name of bareBindings) {
      const callRe = new RegExp(
        String.raw`(?<![.\w$])${name}\s*(?:\.\s*(?:rich|markup|raw|has)\s*)?\(`,
        "g"
      );
      let c;
      while ((c = callRe.exec(src))) {
        const line = lineOf(src, c.index);
        const arg = parseFirstArg(src, c.index + c[0].length);
        if (arg.kind === "literal" && arg.value) {
          required.add(firstSegment(arg.value));
        } else if (arg.kind === "prefix" && arg.value.includes(".")) {
          required.add(firstSegment(arg.value));
        } else {
          errors.push(
            `${rel}:${line} — dynamic ${name}(...) key on a bare useTranslations() binding (fail closed)`
          );
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error("check-client-namespaces: cannot statically determine client namespaces:\n");
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(
    "\nFix: use a literal namespace (useTranslations(\"ns\")) or literal key prefixes, and never call getTranslations/useMessages in client files."
  );
  process.exit(1);
}

// The required set can only shrink through a scanning bug — a suspiciously low
// count means the scan is broken, not that the app stopped using translations.
if (required.size < 20) {
  console.error(
    `check-client-namespaces: only ${required.size} namespaces collected — the scan looks broken (expected ≥ 20)`
  );
  process.exit(1);
}

let declared;
try {
  const source = readFileSync(NAMESPACES_FILE, "utf8");
  const match = source.match(/CLIENT_NAMESPACES[^=]*=\s*\[([\s\S]*?)\]/);
  if (!match) throw new Error("CLIENT_NAMESPACES array not found");
  declared = new Set([...match[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]));
} catch (err) {
  console.error(`check-client-namespaces: cannot read ${relative(ROOT, NAMESPACES_FILE)}: ${err.message}`);
  process.exit(1);
}

// Every declared namespace must exist in every locale file — the layout's
// `ns in messages` filter would silently drop a missing one at runtime and
// crash that locale's client components with MISSING_MESSAGE.
const localeErrors = [];
let localeFiles = [];
try {
  localeFiles = readdirSync(join(ROOT, "messages")).filter((f) => f.endsWith(".json"));
} catch (err) {
  localeErrors.push(`cannot read messages/ dir: ${err.message}`);
}
if (localeFiles.length > 0 && localeFiles.length < 12) {
  localeErrors.push(`messages/ has only ${localeFiles.length} locale files (expected 12)`);
}
for (const file of localeFiles) {
  let messages;
  try {
    messages = JSON.parse(readFileSync(join(ROOT, "messages", file), "utf8"));
  } catch (err) {
    localeErrors.push(`messages/${file}: invalid JSON (${err.message})`);
    continue;
  }
  const absent = [...declared].filter((ns) => !(ns in messages)).sort();
  if (absent.length > 0) {
    localeErrors.push(`messages/${file}: missing declared namespace(s): ${absent.join(", ")}`);
  }
}
if (localeErrors.length > 0) {
  console.error("check-client-namespaces: locale files do not cover CLIENT_NAMESPACES:\n");
  for (const e of localeErrors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

const missing = [...required].filter((ns) => !declared.has(ns)).sort();
const extra = [...declared].filter((ns) => !required.has(ns)).sort();

if (missing.length > 0) {
  console.error(
    "check-client-namespaces: lib/i18n/client-namespaces.ts is missing namespaces used by client components:\n"
  );
  for (const ns of missing) console.error(`  ✗ ${ns}`);
  console.error("\nFull required list:\n");
  console.error(
    [...required]
      .sort()
      .map((ns) => `  "${ns}",`)
      .join("\n")
  );
  process.exit(1);
}

if (extra.length > 0) {
  console.warn(
    `check-client-namespaces: note — declared but no longer used by client components (safe, just extra bytes): ${extra.join(", ")}`
  );
}

console.log(
  `✓ CLIENT_NAMESPACES covers all ${required.size} namespaces used by "use client" files (present in all ${localeFiles.length} locale files)`
);
