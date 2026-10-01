// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyzeMigrations, loadMigrationFiles } from "./check-data-api-grants.mjs";
import { join } from "node:path";

const backfill = "-- data-api-grants: least-privilege-backfill\n";

describe("Data API grant ratchet", () => {
  it("fails when a public table is created without a grant", () => {
    const { problems } = analyzeMigrations([
      {
        name: "a.sql",
        sql: "create table public.widgets (id uuid primary key);",
      },
    ]);
    expect(problems.some((problem) => problem.includes("public.widgets"))).toBe(true);
  });

  it("accepts a grant in the same migration", () => {
    const { problems } = analyzeMigrations([
      {
        name: "a.sql",
        sql: "create table public.widgets (id int); grant select on public.widgets to anon;",
      },
    ]);
    expect(problems).toEqual([]);
  });

  it("accepts an explicit opt-out", () => {
    const { problems } = analyzeMigrations([
      {
        name: "a.sql",
        sql: "create table public.widgets (id int);\n-- data-api-grant: none public.widgets\n",
      },
    ]);
    expect(problems).toEqual([]);
  });

  it("ignores a table that is dropped later", () => {
    const { problems } = analyzeMigrations([
      {
        name: "a.sql",
        sql: "create table public.widgets (id int); drop table public.widgets;",
      },
    ]);
    expect(problems).toEqual([]);
  });

  it("requires a same-file grant after the backfill", () => {
    const { problems } = analyzeMigrations([
      {
        name: "20261106_001.sql",
        sql: `${backfill}create table public.old (id int);\n-- data-api-grant: none public.old\n`,
      },
      { name: "20261107_001.sql", sql: "create table public.newer (id int);" },
      {
        name: "20261108_001.sql",
        sql: "grant select on public.newer to service_role;",
      },
    ]);
    expect(problems.some((problem) => problem.includes("same migration"))).toBe(true);
  });

  it("rejects a backfill grant that production does not already have", () => {
    const { problems } = analyzeMigrations([
      {
        name: "a.sql",
        sql: "create table public.secrets (id int); revoke all on public.secrets from anon, authenticated;",
      },
      {
        name: "b.sql",
        sql: `${backfill}grant select on public.secrets to anon;`,
      },
    ]);
    expect(problems.some((problem) => problem.includes("widen production"))).toBe(true);
  });

  it("accepts a backfill grant that repeats an existing production privilege", () => {
    const { problems } = analyzeMigrations([
      { name: "a.sql", sql: "create table public.events (id int);" },
      {
        name: "b.sql",
        sql: `${backfill}grant select on table public.events to anon;`,
      },
    ]);
    expect(problems).toEqual([]);
  });

  it("requires sequence usage when a client inserts into an identity column", () => {
    const { problems } = analyzeMigrations([
      {
        name: "a.sql",
        sql: "create table public.widgets (id bigint generated always as identity primary key); grant insert on public.widgets to authenticated;",
      },
    ]);
    expect(problems.some((problem) => problem.includes("sequence"))).toBe(true);
  });

  it("accepts the repository migrations", () => {
    const dir = join(import.meta.dirname, "../supabase/migrations");
    const { problems } = analyzeMigrations(loadMigrationFiles(dir));
    expect(problems).toEqual([]);
  });
});
