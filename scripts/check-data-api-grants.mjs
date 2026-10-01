#!/usr/bin/env node
/**
 * Data API grants ratchet.
 *
 * Supabase stops auto-granting new public tables to anon, authenticated, and
 * service_role on 2026-10-30. Every public table created by a migration must
 * have an explicit GRANT, or an explicit opt-out comment when the Data API
 * must not see it:
 *
 *   -- data-api-grant: none public.some_table
 *
 * Migrations after the least-privilege backfill must put that decision in the
 * same file as CREATE TABLE. The backfill itself may only GRANT privileges the
 * hosted project already has (default grants, minus later revokes), so applying
 * it on production is a no-op.
 *
 * Client INSERT into a serial / identity column also needs sequence USAGE.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OPS = ["select", "insert", "update", "delete"];
const API_ROLES = ["anon", "authenticated", "service_role"];
const BACKFILL_MARKER = "data-api-grants: least-privilege-backfill";

function ident(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/"/g, "").replace(/\s+/g, "");
  const parts = cleaned.split(".");
  const name = parts[parts.length - 1].toLowerCase();
  const schema = (parts.length > 1 ? parts[0] : "public").toLowerCase();
  if (!/^[a-z_][\w$]*$/.test(name)) return null;
  return { schema, name };
}

function stripComments(sql) {
  let out = "";
  let i = 0;
  let dollar = null;
  let inLine = false;
  let inBlock = false;
  let inStr = false;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += "\n";
      }
      i++;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i += 2;
        continue;
      }
      if (c === "\n") out += "\n";
      i++;
      continue;
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        out += dollar;
        i += dollar.length;
        dollar = null;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (inStr) {
      out += c;
      if (c === "'" && n === "'") {
        out += n;
        i += 2;
        continue;
      }
      if (c === "'") inStr = false;
      i++;
      continue;
    }
    if (c === "-" && n === "-") {
      inLine = true;
      i += 2;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlock = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      inStr = true;
      out += c;
      i++;
      continue;
    }
    if (c === "$") {
      const m = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        dollar = m[0];
        out += dollar;
        i += dollar.length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

function emptyPrivs(fill) {
  return {
    anon: new Set(fill ? OPS : []),
    authenticated: new Set(fill ? OPS : []),
    service_role: new Set(fill ? OPS : []),
  };
}

function clonePrivs(privs) {
  return {
    anon: new Set(privs.anon),
    authenticated: new Set(privs.authenticated),
    service_role: new Set(privs.service_role),
  };
}

function privilegeList(raw) {
  const text = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (/\ball\s+privileges\b/.test(text) || /(?:^|[,\s])all(?:$|[,\s])/.test(text)) {
    return OPS.slice();
  }
  return text
    .split(",")
    .map((part) => part.trim().split(" ")[0])
    .filter((part) => OPS.includes(part));
}

function roleList(raw) {
  return raw
    .toLowerCase()
    .replace(/\b(with\s+grant\s+option|cascade|restrict|granted\s+by\s+\w+)\b/g, "")
    .split(",")
    .map((role) => role.trim().replace(/"/g, ""))
    .filter(Boolean);
}

function targetsFor(role) {
  if (role === "public") return ["anon", "authenticated"];
  if (API_ROLES.includes(role)) return [role];
  return [];
}

/**
 * @param {{ name: string, sql: string }[]} files migration files in apply order
 */
export function analyzeMigrations(files) {
  const tables = new Map();
  const problems = [];
  const sequenceGrants = [];
  let backfillName = null;

  function live(name) {
    const table = tables.get(name);
    return table && !table.dropped ? table : null;
  }

  for (const file of files) {
    if (file.sql.includes(BACKFILL_MARKER)) backfillName = file.name;
    const stripped = stripComments(file.sql);
    const events = [];
    const ddl =
      /\b(create|drop)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?)/gi;
    let match;
    while ((match = ddl.exec(stripped))) {
      const id = ident(match[2]);
      if (!id || id.schema !== "public") continue;
      const tail = stripped.slice(match.index, match.index + 2500);
      events.push({
        at: match.index,
        kind: match[1].toLowerCase(),
        name: id.name,
        serial: /\b(bigserial|smallserial|serial)\b|generated\s+(?:always|by\s+default)\s+as\s+identity/i.test(
          tail,
        ),
      });
    }
    const priv =
      /\b(grant|revoke)\s+([^;]+?)\s+on\s+(?:table\s+)?(?!(?:function|procedure|routine|sequence|schema|type|all\s+sequences)\b)((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?)\s+(to|from)\s+([^;]+)/gi;
    while ((match = priv.exec(stripped))) {
      const privileges = privilegeList(match[2]);
      if (privileges.length === 0) continue;
      const id = ident(match[3]);
      if (!id || id.schema !== "public") continue;
      events.push({
        at: match.index,
        kind: match[1].toLowerCase(),
        name: id.name,
        privileges,
        roles: roleList(match[5]),
        to: match[4].toLowerCase(),
      });
    }
    const seq =
      /\bgrant\s+([^;]+?)\s+on\s+(?:sequence\s+((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?)|all\s+sequences\s+in\s+schema\s+public)\s+to\s+([^;]+)/gi;
    while ((match = seq.exec(stripped))) {
      sequenceGrants.push({
        privileges: match[1].toLowerCase(),
        sequence: match[2] ? ident(match[2]) : null,
        allSequences: !match[2],
        roles: roleList(match[3]),
      });
    }
    events.sort((a, b) => a.at - b.at);

    const snapshot = new Map();
    if (file.name === backfillName) {
      for (const [name, table] of tables) {
        if (!table.dropped) snapshot.set(name, clonePrivs(table.prod));
      }
    }

    for (const event of events) {
      if (event.kind === "create") {
        const previous = tables.get(event.name);
        tables.set(event.name, {
          name: event.name,
          createdIn: file.name,
          dropped: false,
          serial: event.serial || previous?.serial || false,
          granted: false,
          grantedIn: null,
          prod: emptyPrivs(true),
          explicit: emptyPrivs(false),
        });
        continue;
      }
      if (event.kind === "drop") {
        const table = tables.get(event.name);
        if (table) table.dropped = true;
        continue;
      }
      const table = live(event.name);
      if (!table) continue;
      const isGrant = event.kind === "grant" && event.to === "to";
      const isRevoke = event.kind === "revoke" && event.to === "from";
      if (!isGrant && !isRevoke) continue;
      if (file.name === backfillName && isRevoke) {
        problems.push(
          `${file.name}: revoke on public.${event.name} would change production grants`,
        );
      }
      for (const role of event.roles) {
        for (const target of targetsFor(role)) {
          if (file.name === backfillName && isGrant) {
            const before = snapshot.get(event.name);
            for (const op of event.privileges) {
              if (!before || !before[target].has(op)) {
                problems.push(
                  `${file.name}: granting ${op} on public.${event.name} to ${target} would widen production`,
                );
              }
            }
          }
          for (const op of event.privileges) {
            for (const book of [table.prod, table.explicit]) {
              if (isGrant) book[target].add(op);
              else book[target].delete(op);
            }
          }
        }
      }
      if (isGrant && event.roles.some((role) => targetsFor(role).length > 0)) {
        table.granted = true;
        table.grantedIn = file.name;
      }
    }
    for (const marker of file.sql.matchAll(
      /data-api-grant:\s*none\s+(?:public\.)?([A-Za-z_][\w$]*)/gi,
    )) {
      const table = live(marker[1].toLowerCase());
      if (!table) continue;
      table.granted = true;
      table.grantedIn = table.grantedIn || file.name;
      table.optOut = true;
    }
  }

  for (const table of tables.values()) {
    if (table.dropped) continue;
    if (!table.granted) {
      problems.push(
        `public.${table.name} is created in ${table.createdIn} without a GRANT to anon, authenticated, or service_role, and without "-- data-api-grant: none public.${table.name}"`,
      );
    } else if (
      backfillName &&
      table.createdIn > backfillName &&
      table.grantedIn !== table.createdIn
    ) {
      problems.push(
        `public.${table.name} is created in ${table.createdIn} but its Data API grant is in ${table.grantedIn}. Put the GRANT or "-- data-api-grant: none" in the same migration.`,
      );
    }
    if (!table.serial) continue;
    for (const role of ["anon", "authenticated"]) {
      if (!table.explicit[role].has("insert")) continue;
      const covered = sequenceGrants.some((grant) => {
        const usage = /\busage\b|\ball\b/.test(grant.privileges);
        const roleOk = grant.roles.some((entry) => targetsFor(entry).includes(role));
        const nameOk =
          grant.allSequences ||
          grant.sequence?.name.startsWith(`${table.name}_`);
        return usage && roleOk && nameOk;
      });
      if (!covered) {
        problems.push(
          `public.${table.name} grants INSERT to ${role} and has a serial/identity column, but no sequence USAGE grant for ${role}`,
        );
      }
    }
  }

  return {
    problems,
    tables: [...tables.values()].filter((table) => !table.dropped),
    backfillName,
  };
}

export function loadMigrationFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = join(root, "supabase/migrations");
  const { problems } = analyzeMigrations(loadMigrationFiles(dir));
  if (problems.length === 0) {
    console.log("✓ Public tables have explicit Data API grants (or an explicit opt-out)");
    return;
  }
  console.error("Data API grant check failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("check-data-api-grants.mjs")) {
  main();
}
