import { describe, expect, it } from "vitest";
import { eventImageAlt } from "./image-alt";

describe("cover image disclosure", () => {
  it("discloses a generated cover even when a card has no image_alt column", () => {
    expect(eventImageAlt({ image_url: "https://cdn.dalat.app/yoga.jpg", source_metadata: { activity_media_url: "https://cdn.dalat.app/yoga.jpg", activity_media_provenance: "ai_generated" } }, "Yoga")).toContain("AI-generated illustration; not an actual event photo");
  });
  it("does not apply stale metadata to an organizer replacement", () => {
    expect(eventImageAlt({ image_url: "https://cdn.dalat.app/new.jpg", source_metadata: { activity_media_url: "https://cdn.dalat.app/old.jpg", activity_media_provenance: "ai_generated", activity_media_alt: "AI-generated yoga" } }, "Yoga")).toBe("Yoga");
  });
});
