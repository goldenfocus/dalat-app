import { describe, expect, it } from "vitest";
import { selectVenueHighlights, type VenueHighlight } from "./highlights";

const photo = (id: string, event_id: string, priority = 0): VenueHighlight => ({
  id, event_id, media_url: id, thumbnail_url: null, event_slug: event_id, event_title: event_id,
  featured_priority: priority, view_count: 0, created_at: "2026-11-10",
});
describe("venue highlights", () => {
  it("shows varied events before filling from one large upload", () => {
    const result = selectVenueHighlights([photo("a", "one", 10), photo("b", "one", 9), photo("c", "two"), photo("d", "three")], [], 3);
    expect(result.map(p => p.id)).toEqual(["a", "c", "d"]);
  });
  it("preserves owner order, ignores removed/private photos, and fills missing slots", () => {
    const result = selectVenueHighlights([photo("a", "one"), photo("b", "two"), photo("c", "three", 99)], ["b", "missing", "b", "a"], 3);
    expect(result.map(p => p.id)).toEqual(["b", "a", "c"]);
  });
  it("caps the preview and never duplicates a photo", () => {
    expect(selectVenueHighlights(Array.from({ length: 20 }, (_, i) => photo(String(i), "one")), [])).toHaveLength(6);
  });
});
