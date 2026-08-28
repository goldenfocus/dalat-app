import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

function source(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("venue-name preservation policy", () => {
  it("never plumbs machine-translated venue titles into public cards", () => {
    const directorySources = [
      source("app/[locale]/venues/page.tsx"),
      source("components/venues/venues-directory.tsx"),
      source("components/venues/venue-card.tsx"),
    ].join("\n");

    expect(directorySources).not.toMatch(/translatedNames?|getVenueTranslationsBatch/);
  });

  it("keeps the vanity venue route on the canonical venue name", () => {
    const venueContent = source("app/[locale]/[slug]/venue-content.tsx");

    expect(venueContent).not.toMatch(/translatedName|venueTranslations\.title/);
  });

  it("never queues venue names as translatable titles", () => {
    const sweep = source("lib/translation-sweep.ts");

    expect(sweep).not.toMatch(/field_name:\s*["']title["'],\s*text:\s*venue\.name/);
  });
});
