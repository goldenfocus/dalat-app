import { describe, expect, it } from "vitest";
import { autofill } from "./autofill";
import { emptyStory } from "./schema";
const draft = {
  ...emptyStory("en"),
  venue_id: null,
  visit_date: "2026-09-13",
  selected_media: ["00000000-0000-4000-8000-000000000001"],
  venue_confirmed: false,
  permission_confirmed: false,
  sponsorship: "",
};
const generated = {
  ...emptyStory("en"),
  title: "A quiet visit",
  narrative: "I enjoyed my visit.",
  summary: "A short visit.",
  category: "wellness" as const,
  photos: [
    {
      id: draft.selected_media[0],
      alt: "A massage room",
      caption: "Room during the visit",
    },
  ],
};
describe("automatic draft handoff", () => {
  it("fills the entire blank draft without adding consent or publication", () => {
    const next = autofill(draft, generated);
    expect(next.title).toBe(generated.title);
    expect(next.narrative).toBe(generated.narrative);
    expect(next.category).toBe("wellness");
    expect(next.photos[0].alt).toBe("A massage room");
    expect(next.permission_confirmed).toBe(false);
    expect(next.venue_confirmed).toBe(false);
  });
  it("preserves user corrections, photo removal and sponsorship", () => {
    const next = autofill(
      {
        ...draft,
        title: "My title",
        selected_media: [],
        sponsorship: "Hosted visit",
      },
      generated,
    );
    expect(next.title).toBe("My title");
    expect(next.photos).toEqual([]);
    expect(next.sponsorship).toBe("Hosted visit");
  });
  it("can update previous AI wording without overwriting a corrected story", () => {
    const next = autofill(
      { ...draft, ...generated, narrative: "My corrected story" },
      { ...generated, title: "Updated" },
      generated,
    );
    expect(next.title).toBe("Updated");
    expect(next.narrative).toBe("My corrected story");
  });
});
