import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const MOMENTS_PAGE = "app/[locale]/events/[slug]/moments/page.tsx";

describe("event moments locale-aware links", () => {
  it("lets the next-intl Link add the active locale exactly once", () => {
    const page = readFileSync(path.join(ROOT, MOMENTS_PAGE), "utf8");

    expect(page).toContain('import { Link } from "@/lib/i18n/routing"');
    expect(page).not.toMatch(/href=\{`\/\$\{locale\}\/events\//);
    expect(page).toContain('href={`/events/${event.slug}`}');
    expect(page).toContain('href={`/events/${event.slug}/moments/new`}');
  });
});
