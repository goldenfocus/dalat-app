import { describe, expect, it } from "vitest";
import { arrivalPerson, pairRound, practiceView, type Person } from "./model";

const people: Person[] = [
  { id: "a", name: "An", speaks: ["vi"], learns: "en" },
  { id: "b", name: "Ben", speaks: ["en"], learns: "vi" },
  { id: "c", name: "Chi", speaks: ["vi"], learns: "en" },
  { id: "d", name: "Dan", speaks: ["en"], learns: "vi" },
];
describe("practice from event attendance", () => {
  it("includes every checked-in person exactly once, with an odd guest in a trio", () => {
    const roster = [...people, { ...people[0], id: "e", name: "Em" }];
    const round = pairRound([...roster, roster[0]], [], 10);
    expect(round.groups.map(g => g.length).sort()).toEqual([2, 3]);
    expect(round.groups.flat().map(p => p.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("uses reciprocal language preferences and changes partners next round", () => {
    const first = pairRound(people, [], 10);
    for (const group of first.groups) expect(group[0].learns).toBe(group[1].speaks[0]);
    const second = pairRound(people, [first], 10);
    expect(second.groups.find(g => g.some(p => p.id === "a"))?.map(p => p.id).sort())
      .not.toEqual(first.groups.find(g => g.some(p => p.id === "a"))?.map(p => p.id).sort());
  });
  it("keeps other groups private and queues a late arrival without reshuffling", () => {
    const round = pairRound(people, [], 10);
    const state = { rounds: [round] };
    const guest = practiceView(state, people, "a", false);
    expect(guest.groups).toHaveLength(1);
    expect(guest.round?.groups).toEqual([]);
    expect(guest.myGroup?.some(p => p.id === "a")).toBe(true);
    expect(guest.myGroupNumber).toBe(round.groups.findIndex(g => g.some(p => p.id === "a")) + 1);
    expect(JSON.stringify(guest)).not.toContain('"name":"' + (round.groups.find(g => !g.some(p => p.id === "a"))![0].name) + '"');
    expect(practiceView(state, people, "late", false).groups).toEqual([]);
    expect(practiceView(state, people, null, false).groups).toEqual([]);
    expect(practiceView(state, people, null, true).groups).toHaveLength(2);
  });
  it("preserves explicit language choices without guessing fluency", () => {
    const p = arrivalPerson({ id: "p", event_id: "e", user_id: null, nickname: "Person", checked_in_at: "now", practice_language: "english", english_level: null, vietnamese_level: null });
    expect(p).toEqual({ id: "p", name: "Person", speaks: [], learns: "en" });
    expect(() => pairRound([p], [], 10)).toThrow("invalid_roster");
  });
});
