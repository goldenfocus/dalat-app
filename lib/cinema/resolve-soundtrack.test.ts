import { describe, expect, it } from "vitest";
import { moodsForHints, resolveSoundtrack, seededIndex } from "./resolve-soundtrack";

const track = (id: string, mood: string | null = null) => ({ id, mood });
const house = [track("h1", "chill"), track("h2", "upbeat"), track("h3", "chill"), track("h4", "night"), track("h5", "chill")];

describe("resolveSoundtrack", () => {
  it("keeps the event's own tracks and is not house", () => {
    const own = [track("own1")];
    expect(resolveSoundtrack({ eventId: "e", eventTracks: own, houseTracks: house })).toEqual({ tracks: own, isHouse: false });
  });

  it("returns nothing when there is no own music and the library is empty", () => {
    expect(resolveSoundtrack({ eventId: "e", eventTracks: [], houseTracks: [] })).toEqual({ tracks: [], isHouse: false });
  });

  it("falls back to house tracks when the event has none", () => {
    const result = resolveSoundtrack({ eventId: "e", eventTracks: [], houseTracks: house });
    expect(result.isHouse).toBe(true);
    expect(result.tracks.length).toBeGreaterThan(0);
    expect(result.tracks.length).toBeLessThanOrEqual(3);
  });

  it("is deterministic per event and independent of input order", () => {
    const a = resolveSoundtrack({ eventId: "event-42", eventTracks: [], houseTracks: house });
    const b = resolveSoundtrack({ eventId: "event-42", eventTracks: [], houseTracks: [...house].reverse() });
    expect(b.tracks).toEqual(a.tracks);
  });

  it("spreads different events across the library", () => {
    const picks = new Set(Array.from({ length: 40 }, (_, i) => resolveSoundtrack({ eventId: `event-${i}`, eventTracks: [], houseTracks: house }).tracks[0].id));
    expect(picks.size).toBeGreaterThan(1);
  });

  it("prefers a matching mood and honours mood priority order", () => {
    for (let i = 0; i < 20; i++) {
      const r = resolveSoundtrack({ eventId: `e${i}`, eventTracks: [], houseTracks: house, preferredMoods: ["night", "chill"] });
      expect(r.tracks.every((t) => t.mood === "night")).toBe(true);
      const c = resolveSoundtrack({ eventId: `e${i}`, eventTracks: [], houseTracks: house, preferredMoods: ["misty", "chill"] });
      expect(c.tracks.every((t) => t.mood === "chill")).toBe(true);
    }
  });

  it("uses the whole library when no preferred mood is available", () => {
    const r = resolveSoundtrack({ eventId: "e", eventTracks: [], houseTracks: house, preferredMoods: ["celebration"] });
    expect(r.isHouse).toBe(true);
    expect(r.tracks.length).toBeGreaterThan(0);
  });

  it("does not repeat tracks in a small pool", () => {
    const r = resolveSoundtrack({ eventId: "e", eventTracks: [], houseTracks: [track("only")] });
    expect(r.tracks.map((t) => t.id)).toEqual(["only"]);
  });
});

describe("moodsForHints / seededIndex", () => {
  it("maps hints to moods, strongest first, and ignores empties", () => {
    expect(moodsForHints([])).toEqual([]);
    expect(moodsForHints([null, undefined])).toEqual([]);
    expect(moodsForHints(["Acoustic guitar night", "open mic"])[0]).toBe("acoustic");
    expect(moodsForHints(["coffee workshop"])).toContain("chill");
  });

  it("stays within range", () => {
    for (let i = 0; i < 50; i++) expect(seededIndex(`id-${i}`, 7)).toBeLessThan(7);
    expect(seededIndex("x", 0)).toBe(0);
  });
});
