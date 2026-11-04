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

import { assignTables, DEFAULT_TABLES, eligiblePeople, numberPeople, participantStatus, presenceStatus, remainingSeconds, rosterFingerprint, updateClock, type PracticeState } from "./model";

describe("present and playing eligibility", () => {
  it("requires host confirmation, excludes absent people, and keeps answers private", () => {
    const state: PracticeState = { rounds: [], presence: { a: "present", b: "absent" } };
    expect(eligiblePeople(state, people).map(person => person.id)).toEqual(["a"]);
    expect(practiceView(state, people, null, true).participants?.filter(person => person.presence === "pending").map(person => person.id)).toEqual(["c", "d"]);
    const guest = practiceView(state, people, "a", false);
    expect(guest.presence).toBe("present");
    expect(guest.participants).toBeUndefined();
    expect(JSON.stringify(guest)).not.toContain("absent");
    expect(practiceView(state, people, null, true).participants?.find(person => person.id === "b")?.presence).toBe("absent");
  });
  it("preserves legacy published rounds but never infers presence for new arrivals", () => {
    const state: PracticeState = { rounds: [pairRound(people.slice(0, 2), [])] };
    expect(presenceStatus(state, "a")).toBe("present");
    expect(presenceStatus(state, "c")).toBe("pending");
    state.presence = { a: "absent" };
    expect(presenceStatus(state, "a")).toBe("absent");
    expect(eligiblePeople(state, people).map(person => person.id)).toEqual(["b"]);
  });
  it("retains arrivals without a second check-in but excludes staff, visitors, breaks and departures", () => {
    const state: PracticeState = { rounds: [], participation: { b: "visiting", c: "break", d: "left" }, presence: { a: "present" } };
    expect(eligiblePeople(state, people, new Set(["a"]))).toEqual([]);
    expect(participantStatus(state, "a", new Set(["a"]))).toBe("hosting");
    state.participation!.a = "playing";
    expect(eligiblePeople(state, people, new Set(["a"])).map(p => p.id)).toEqual(["a"]);
  });
  it("keeps event numbers after someone leaves and newcomers arrive", () => {
    const state: PracticeState = { rounds: [], numbers: { a: 4, departed: 9 } };
    expect(numberPeople(state, [people[0], people[1]]).map(p => p.number)).toEqual([4, 10]);
  });
  it("detects roster, ability, floor policy and table changes before publishing", () => {
    const baseline = rosterFingerprint(people, DEFAULT_TABLES, "balanced");
    expect(rosterFingerprint([...people].reverse(), [...DEFAULT_TABLES].reverse(), "balanced")).toBe(baseline);
    expect(rosterFingerprint(people.slice(1), DEFAULT_TABLES, "balanced")).not.toBe(baseline);
    expect(rosterFingerprint([{ ...people[0], learns: "fr" }, ...people.slice(1)], DEFAULT_TABLES, "balanced")).not.toBe(baseline);
    expect(rosterFingerprint(people, DEFAULT_TABLES.map(t => t.number === 1 ? { ...t, available: false } : t), "balanced")).not.toBe(baseline);
    expect(rosterFingerprint(people, DEFAULT_TABLES, "upstairs")).not.toBe(baseline);
  });
});

function roster(count: number) { return Array.from({ length: count }, (_, i) => ({ ...people[i % 4], id: `p${i}` })); }
describe("physical tables", () => {
  it("keeps a ten-person gathering downstairs and uses small tables first", () => {
    const groups = pairRound(roster(10), [], 12).groups;
    const assigned = assignTables(groups, DEFAULT_TABLES, "balanced");
    expect(assigned).toHaveLength(5);
    expect(assigned.every(a => a.floor === "downstairs")).toBe(true);
    expect(assigned.some(a => [4, 6, 7].includes(a.tableNumber))).toBe(true);
    expect(assigned.some(a => a.tableNumber === 5)).toBe(false);
  });
  it("spreads a large group across floors without exceeding seats, including shared tables", () => {
    const groups = pairRound(roster(40), [], 12).groups;
    const assigned = assignTables(groups, DEFAULT_TABLES, "balanced");
    expect(new Set(assigned.map(a => a.floor)).size).toBe(2);
    const used = new Map<number, number>();
    for (const a of assigned) used.set(a.tableNumber, (used.get(a.tableNumber) || 0) + groups[a.groupIndex].length);
    for (const [number, seats] of used) expect(seats).toBeLessThanOrEqual(DEFAULT_TABLES.find(t => t.number === number)!.capacity);
    expect(used.has(5)).toBe(false);
    expect(assigned).toHaveLength(groups.length);
  });
  it("handles an odd trio, blocked tables and insufficient capacity", () => {
    const groups = pairRound(roster(9), [], 12).groups;
    const assigned = assignTables(groups, DEFAULT_TABLES.map(t => ({ ...t, available: t.floor === "upstairs" })), "downstairs");
    expect(assigned.every(a => a.floor === "upstairs")).toBe(true);
    const trio = assigned.find(a => groups[a.groupIndex].length === 3)!;
    expect(DEFAULT_TABLES.find(t => t.number === trio.tableNumber)!.capacity).toBeGreaterThanOrEqual(3);
    expect(() => assignTables(groups, DEFAULT_TABLES.map(t => ({ ...t, available: t.number === 4 })), "balanced")).toThrow("invalid_table_capacity");
  });
  it("respects an upstairs preference when enough seats are available", () => {
    const assigned = assignTables(pairRound(roster(10), [], 12).groups, DEFAULT_TABLES, "upstairs");
    expect(assigned.every(a => a.floor === "upstairs")).toBe(true);
  });
});

describe("persisted authoritative clock", () => {
  const start = new Date("2026-11-04T12:00:00.000Z");
  it("pauses, extends and resumes identically after reload", () => {
    const round = pairRound(people, [], 12, start);
    const paused = updateClock(round, "pause", new Date(start.getTime() + 120_000));
    expect(remainingSeconds(paused, new Date(start.getTime() + 3_600_000))).toBe(600);
    const extended = updateClock(JSON.parse(JSON.stringify(paused)), "extend", new Date(start.getTime() + 3_600_000), 120);
    const resumed = updateClock(extended, "resume", new Date(start.getTime() + 3_600_000));
    expect(resumed.endsAt).toBe("2026-11-04T13:12:00.000Z");
    expect(remainingSeconds(resumed, new Date("2026-11-04T13:01:00.000Z"))).toBe(660);
  });
  it("ends explicitly without changing partners and persists changeover", () => {
    const round = pairRound(people, [], 12, start);
    const ended = updateClock(round, "end", new Date("2026-11-04T12:12:00.000Z"));
    expect(remainingSeconds(ended, start)).toBe(0);
    expect(ended.changeoverEndsAt).toBe("2026-11-04T12:13:30.000Z");
    expect(ended.groups).toEqual(round.groups);
    expect(() => updateClock(ended, "resume", start)).toThrow("status_conflict");
  });
  it("keeps draft and all other assignments private while preserving published partner/table", () => {
    const round = pairRound(numberPeople({ rounds: [] }, people), [], 12, start);
    round.assignments = assignTables(round.groups, DEFAULT_TABLES, "balanced");
    const state: PracticeState = { rounds: [round], draft: { id: "secret", round: 2, groups: [...round.groups].reverse(), minutes: 12, assignments: round.assignments, rosterFingerprint: "private", createdAt: start.toISOString() } };
    const guest = practiceView(state, people, "a", false);
    expect(guest.draft).toBeNull();
    expect(guest.participants).toBeUndefined();
    expect(guest.round!.assignments).toHaveLength(1);
    expect(guest.myTable?.groupIndex).toBe(round.groups.findIndex(g => g.some(p => p.id === "a")));
    const anonymous = practiceView(state, people, null, false);
    expect(anonymous.myGroup).toEqual([]);
    expect(anonymous.round?.assignments).toEqual([]);
    expect(anonymous.myTable).toBeNull();
  });
});

import { DEFAULT_ROUND_MINUTES, swapDraftParticipants, type Draft } from "./model";
function editableDraft(count = 4): Draft {
  const groups = pairRound(roster(count), []).groups;
  return { id: "original-draft", round: 1, minutes: DEFAULT_ROUND_MINUTES, groups,
    assignments: assignTables(groups, DEFAULT_TABLES, "balanced"), rosterFingerprint: "unchanged-roster", createdAt: "2026-11-04T12:00:00Z" };
}
describe("host draft edits", () => {
  it("defaults new rounds to twenty minutes while preserving explicit durations", () => {
    expect(pairRound(people, []).minutes).toBe(20);
    expect(pairRound(people, [], 12).minutes).toBe(12);
  });
  it("exchanges two existing members across groups without changing tables, sizes or the original draft", () => {
    const original = editableDraft();
    const before = structuredClone(original);
    const first = original.groups[0][0];
    const second = original.groups[1][0];
    const swapped = swapDraftParticipants(original, first.id, second.id, "new-draft", DEFAULT_TABLES);
    expect(swapped.groups[0][0]).toEqual(second);
    expect(swapped.groups[1][0]).toEqual(first);
    expect(swapped.groups.map(group => group.length)).toEqual(original.groups.map(group => group.length));
    expect(swapped.groups.flat().map(p => p.id).sort()).toEqual(original.groups.flat().map(p => p.id).sort());
    expect(swapped.assignments).toEqual(original.assignments);
    expect(swapped.rosterFingerprint).toBe(original.rosterFingerprint);
    expect(swapped.id).not.toBe(original.id);
    expect(original).toEqual(before);
  });
  it("keeps pairs and an odd trio the same size after a swap", () => {
    const original = editableDraft(5);
    const swapped = swapDraftParticipants(original, original.groups[0][0].id, original.groups[1][0].id, "new-draft", DEFAULT_TABLES);
    expect(swapped.groups.map(group => group.length)).toEqual(original.groups.map(group => group.length));
    expect(swapped.groups.flat()).toHaveLength(5);
  });
  it("rejects the same person, same-group swaps, unknown IDs and reused draft IDs", () => {
    const draft = editableDraft();
    const [first, peer] = draft.groups[0];
    const other = draft.groups[1][0];
    for (const [a, b] of [[first.id, first.id], [first.id, peer.id], [first.id, "not-in-draft"]]) {
      expect(() => swapDraftParticipants(draft, a, b, "new-draft", DEFAULT_TABLES)).toThrow("invalid_draft_swap");
    }
    expect(() => swapDraftParticipants(draft, first.id, other.id, draft.id, DEFAULT_TABLES)).toThrow("invalid_draft_swap");
  });
  it("rejects blocked tables and combined shared-table capacity violations", () => {
    const draft = editableDraft(6);
    const ids = [draft.groups[0][0].id, draft.groups[1][0].id];
    const blocked = DEFAULT_TABLES.map(table => ({ ...table, available: false }));
    expect(() => swapDraftParticipants(draft, ids[0], ids[1], "new-draft", blocked)).toThrow("invalid_table_capacity");
    const crowded = { ...draft, assignments: draft.groups.map((_, groupIndex) => ({ groupIndex, tableNumber: 1, floor: "downstairs" as const })) };
    expect(() => swapDraftParticipants(crowded, ids[0], ids[1], "new-draft", DEFAULT_TABLES)).toThrow("invalid_table_capacity");
  });
});
