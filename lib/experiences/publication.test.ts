import { describe, it, expect } from "vitest";
import { publicationReady } from "./publication";
import { emptyStory } from "./schema";
const story = {
  ...emptyStory("en"),
  title: "Lunch",
  narrative: "The soup was warm and pleasant during my lunch visit.",
  venue_id: null,
  venue_name: "Contributor supplied place",
  venue_address: "Contributor supplied address",
  visit_date: "2026-09-12",
  selected_media: ["00000000-0000-4000-8000-000000000001"],
  venue_confirmed: true,
  permission_confirmed: true,
  sponsorship: "",
};
describe("explicit publication gates", () => {
  it("accepts a reviewed dated original experience", () =>
    expect(publicationReady(story, "2026-09-12")).toBe(true));
  it.each([
    { permission_confirmed: false },
    { venue_confirmed: false },
    { title: "" },
    { visit_date: "2026-09-13" },
  ])("rejects incomplete or future evidence: %j", (patch) =>
    expect(publicationReady({ ...story, ...patch }, "2026-09-12")).toBe(false),
  );
  it("allows a short sentence or photo alone without requiring a location", () => {
    expect(
      publicationReady(
        {
          ...story,
          venue_id: null,
          venue_name: "",
          venue_address: "",
          venue_confirmed: false,
          narrative: "",
          selected_media: story.selected_media,
        },
        "2026-09-12",
      ),
    ).toBe(true);
    expect(
      publicationReady(
        {
          ...story,
          venue_id: null,
          venue_name: "",
          venue_address: "",
          venue_confirmed: false,
          narrative: "Lovely.",
          selected_media: [],
        },
        "2026-09-12",
      ),
    ).toBe(true);
    expect(
      publicationReady(
        { ...story, narrative: "", selected_media: [] },
        "2026-09-12",
      ),
    ).toBe(false);
  });
  it("allows an existing venue without duplicating its address", () =>
    expect(
      publicationReady(
        {
          ...story,
          venue_address: "",
          venue_id: "00000000-0000-4000-8000-000000000002",
        },
        "2026-09-12",
      ),
    ).toBe(true));
});
