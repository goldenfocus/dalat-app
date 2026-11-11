import { describe, expect, it } from "vitest";
import { arrivalPerson, pairRound, practiceView, seatLateArrival, LATE_GROUP_LIMIT, type Person, type Round } from "./model";

const people: Person[] = [
  { id: "a", name: "An", speaks: ["vi"], learns: "en" },
  { id: "b", name: "Ben", speaks: ["en"], learns: "vi" },
  { id: "c", name: "Chi", speaks: ["vi"], learns: "en" },
  { id: "d", name: "Dan", speaks: ["en"], learns: "vi" },
];
const eight: Person[] = [...people, ...people.map((person, index) => ({ ...person, id: "efgh"[index], name: ["Em", "Finn", "Giang", "Hugo"][index] }))];
describe("practice from event attendance", () => {
  it("includes every checked-in person exactly once and keeps five people at one table", () => {
    const roster = [...people, { ...people[0], id: "e", name: "Em" }];
    const round = pairRound([...roster, roster[0]], [], 10);
    expect(round.groups.map(g => g.length)).toEqual([5]);
    expect(round.groups.flat().map(p => p.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("forms tables of three or four from six people up, and one table below that", () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => ({ ...people[i % 4], id: `n${i}` }));
    for (const count of [2, 3, 4, 5]) expect(pairRound(many(count), []).groups.map(g => g.length)).toEqual([count]);
    for (let count = 6; count <= 60; count++) {
      const groups = pairRound(many(count), []).groups;
      expect(groups.flat().map(p => p.id).sort()).toEqual(many(count).map(p => p.id).sort());
      expect(groups.length).toBe(Math.round(count / 3.5));
      for (const group of groups) expect([3, 4]).toContain(group.length);
    }
    expect(pairRound(many(7), []).groups.map(g => g.length)).toEqual([4, 3]);
    expect(pairRound(many(10), []).groups.map(g => g.length)).toEqual([4, 3, 3]);
  });
  it("spreads Vietnamese speakers first, one per table as far as they go", () => {
    const visitors: Person[] = Array.from({ length: 9 }, (_, i) => ({ id: `en${i}`, name: `Visitor ${i}`, speaks: ["en"], learns: "vi" }));
    const locals: Person[] = Array.from({ length: 3 }, (_, i) => ({ id: `vi${i}`, name: `Local ${i}`, speaks: ["vi"], learns: "en" }));
    const balanced = pairRound([...visitors, ...locals], []).groups;
    expect(balanced).toHaveLength(3);
    for (const group of balanced) expect(group.filter(p => p.speaks.includes("vi"))).toHaveLength(1);
    // Fewer locals than tables: each local still anchors a different table.
    const scarce = pairRound([...visitors, ...locals.slice(0, 2)], []).groups;
    expect(scarce.map(group => group.filter(p => p.speaks.includes("vi")).length).sort()).toEqual([0, 1, 1]);
    // More locals than tables: nobody is left without one.
    const plenty = pairRound([...visitors.slice(0, 3), ...locals, { ...locals[0], id: "vi3" }, { ...locals[0], id: "vi4" }], []).groups;
    for (const group of plenty) expect(group.some(p => p.speaks.includes("vi"))).toBe(true);
    expect(pairRound([...visitors, ...locals], []).groups).toEqual(balanced);
  });
  it("mixes languages at each table and changes tablemates next round", () => {
    const first = pairRound(eight, [], 10);
    expect(first.groups.map(g => g.length)).toEqual([4, 4]);
    for (const group of first.groups) expect(new Set(group.flatMap(p => p.speaks))).toEqual(new Set(["vi", "en"]));
    const second = pairRound(eight, [first], 10);
    expect(second.groups.find(g => g.some(p => p.id === "a"))?.map(p => p.id).sort())
      .not.toEqual(first.groups.find(g => g.some(p => p.id === "a"))?.map(p => p.id).sort());
  });
  it("keeps other groups private and queues a late arrival without reshuffling", () => {
    const people = eight;
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
  it("reads who can help from a quick check-in's comfortable legacy levels", () => {
    const base = { id: "p", event_id: "e", user_id: null, nickname: "Person", checked_in_at: "now" };
    expect(arrivalPerson({ ...base, practice_language: "english", english_level: "some", vietnamese_level: "native" }).speaks).toEqual(["vi"]);
    expect(arrivalPerson({ ...base, practice_language: "vietnamese", english_level: "fluent", vietnamese_level: "starting" }).speaks).toEqual(["en"]);
    expect(arrivalPerson({ ...base, practice_language: "both", english_level: "comfortable", vietnamese_level: "advanced" }).speaks).toEqual(["vi", "en"]);
    // A full language profile stays authoritative over the legacy columns.
    expect(arrivalPerson({ ...base, practice_language: "english", english_level: "native", vietnamese_level: "native", language_preferences: { speaks: [{ language: "fr", level: "native" }], learning: { language: "vi", level: "new" } } }).speaks).toEqual(["fr"]);
  });
});

describe("late arrivals join the running round", () => {
  const start = new Date("2026-11-04T12:00:00.000Z");
  const during = new Date("2026-11-04T12:05:00.000Z");
  const late: Person = { id: "late", name: "Late", speaks: ["en"], learns: "vi" };
  function running(roster = eight): PracticeState {
    const round = pairRound(roster, [], 20, start);
    return { rounds: [{ ...round, assignments: assignTables(round.groups, DEFAULT_TABLES, "balanced") }] };
  }
  it("seats a newcomer at the smallest table without moving anyone", () => {
    const state = running(eight.slice(0, 7));
    const before = structuredClone(state);
    const seated = seatLateArrival(state, late, during);
    expect(state).toEqual(before);
    expect(seated.rounds[0].groups.map(g => g.length)).toEqual([4, 4]);
    expect(seated.rounds[0].groups[1].at(-1)).toEqual(late);
    expect(seated.rounds[0].groups[0]).toEqual(before.rounds[0].groups[0]);
    expect(seated.rounds[0].assignments).toEqual(before.rounds[0].assignments);
    expect(practiceView(seated, [...eight, late], "late", false, 0, new Set(), during).myTable?.tableNumber).toBe(before.rounds[0].assignments![1].tableNumber);
  });
  it("sends a Vietnamese speaker to a table that lacks one", () => {
    const visitors: Person[] = Array.from({ length: 5 }, (_, i) => ({ id: `en${i}`, name: `Visitor ${i}`, speaks: ["en"], learns: "vi" }));
    const state = running([people[0], ...visitors, { ...visitors[0], id: "en5" }]);
    const lacking = state.rounds[0].groups.findIndex(group => !group.some(p => p.speaks.includes("vi")));
    expect(lacking).toBeGreaterThanOrEqual(0);
    const seated = seatLateArrival(state, { id: "local", name: "Local", speaks: ["vi"], learns: "en" }, during);
    expect(seated.rounds[0].groups[lacking].some(p => p.id === "local")).toBe(true);
  });
  it("prefers tablemates the newcomer has not met when sizes tie", () => {
    const [a, , c, d, e, f, g] = eight;
    const earlier: Round = { number: 1, startedAt: "2026-11-04T11:00:00.000Z", minutes: 20, endedAt: "2026-11-04T11:20:00.000Z", groups: [[late, a, c, e]] };
    const live: Round = { number: 2, startedAt: start.toISOString(), endsAt: new Date(start.getTime() + 20 * 60_000).toISOString(), minutes: 20, groups: [[a, c, e], [d, f, g]] };
    const seated = seatLateArrival({ rounds: [earlier, live] }, late, during);
    expect(seated.rounds[1].groups.map(group => group.some(p => p.id === "late"))).toEqual([false, true]);
    expect(seated.rounds[0]).toEqual(earlier);
  });
  it("does nothing before a round, after it ends, or for someone already seated", () => {
    expect(seatLateArrival({ rounds: [] }, late, during)).toEqual({ rounds: [] });
    const state = running();
    expect(seatLateArrival(state, eight[0], during)).toBe(state);
    expect(seatLateArrival(state, late, new Date(start.getTime() + 21 * 60_000))).toBe(state);
    const ended: PracticeState = { rounds: [updateClock(state.rounds[0], "end", during)] };
    expect(seatLateArrival(ended, late, during)).toBe(ended);
    const paused: PracticeState = { rounds: [updateClock(state.rounds[0], "pause", during)] };
    expect(seatLateArrival(paused, late, new Date(start.getTime() + 3_600_000)).rounds[0].groups.flat().some(p => p.id === "late")).toBe(true);
  });
  it("opens a new table once every table is full instead of crowding one", () => {
    let state = running(eight.slice(0, 4));
    const arrivals = Array.from({ length: 4 }, (_, i) => ({ ...late, id: `late${i}` }));
    state = seatLateArrival(state, arrivals[0], during);
    expect(state.rounds[0].groups.map(g => g.length)).toEqual([LATE_GROUP_LIMIT]);
    state = seatLateArrival(state, arrivals[1], during);
    expect(state.rounds[0].groups.map(g => g.length)).toEqual([5, 1]);
    expect(state.rounds[0].assignments).toHaveLength(2);
    expect(state.rounds[0].assignments![1].groupIndex).toBe(1);
    expect(state.rounds[0].assignments![1].tableNumber).not.toBe(state.rounds[0].assignments![0].tableNumber);
    expect(DEFAULT_TABLES.find(t => t.number === state.rounds[0].assignments![1].tableNumber)!.capacity).toBeGreaterThanOrEqual(3);
    state = seatLateArrival(seatLateArrival(state, arrivals[2], during), arrivals[3], during);
    expect(state.rounds[0].groups.map(g => g.length)).toEqual([5, 3]);
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
  const seatsUsed = (groups: Person[][], assigned: ReturnType<typeof assignTables>) => {
    const used = new Map<number, number>();
    for (const a of assigned) used.set(a.tableNumber, (used.get(a.tableNumber) || 0) + groups[a.groupIndex].length);
    return used;
  };
  it("seats ten people 60% upstairs and 40% downstairs", () => {
    const groups = pairRound(roster(10), [], 12).groups;
    const assigned = assignTables(groups, DEFAULT_TABLES, "balanced");
    expect(assigned).toHaveLength(3);
    expect(assigned.filter(a => a.floor === "upstairs").reduce((sum, a) => sum + groups[a.groupIndex].length, 0)).toBe(6);
    expect(assigned.some(a => a.tableNumber === 5)).toBe(false);
    for (const [number, seats] of seatsUsed(groups, assigned)) expect(seats).toBeLessThanOrEqual(DEFAULT_TABLES.find(t => t.number === number)!.capacity);
  });
  it("spreads a medium group across floors without exceeding seats while tables fit", () => {
    const groups = pairRound(roster(12), [], 12).groups;
    const assigned = assignTables(groups, DEFAULT_TABLES, "balanced");
    expect(new Set(assigned.map(a => a.floor)).size).toBe(2);
    for (const [number, seats] of seatsUsed(groups, assigned)) expect(seats).toBeLessThanOrEqual(DEFAULT_TABLES.find(t => t.number === number)!.capacity);
  });
  it("never blocks a large evening for seats: overflow spreads across open tables, bar last", () => {
    const groups = pairRound(roster(40), [], 12).groups;
    const assigned = assignTables(groups, DEFAULT_TABLES, "balanced");
    expect(assigned).toHaveLength(groups.length);
    expect(assigned.map(a => a.groupIndex)).toEqual(groups.map((_, index) => index));
    expect(new Set(assigned.map(a => a.floor)).size).toBe(2);
    const used = seatsUsed(groups, assigned);
    expect(used.has(5)).toBe(false);
    // Nobody is stacked several groups deep on one small table while others sit empty.
    for (const [number, seats] of used) expect(seats - DEFAULT_TABLES.find(t => t.number === number)!.capacity).toBeLessThanOrEqual(2);
  });
  it("handles blocked floors and one tiny table, and only fails with no table at all", () => {
    const groups = pairRound(roster(9), [], 12).groups;
    const assigned = assignTables(groups, DEFAULT_TABLES.map(t => ({ ...t, available: t.floor === "upstairs" })), "downstairs");
    expect(assigned.every(a => a.floor === "upstairs")).toBe(true);
    expect(assigned.filter(a => [13, 14].includes(a.tableNumber))).toHaveLength(2);
    const crowded = assignTables(groups, DEFAULT_TABLES.map(t => ({ ...t, available: t.number === 4 })), "balanced");
    expect(crowded.map(a => a.tableNumber)).toEqual([4, 4, 4]);
    const barOnly = assignTables(groups, DEFAULT_TABLES.map(t => ({ ...t, available: !!t.bar })), "balanced");
    expect(barOnly.every(a => a.tableNumber === 5)).toBe(true);
    expect(() => assignTables(groups, DEFAULT_TABLES.map(t => ({ ...t, available: false })), "balanced")).toThrow("invalid_table_capacity");
    expect(() => assignTables(groups, [], "balanced")).toThrow("invalid_table_capacity");
  });
  it("respects an upstairs preference when enough seats are available", () => {
    const assigned = assignTables(pairRound(roster(7), [], 12).groups, DEFAULT_TABLES, "upstairs");
    expect(assigned.every(a => a.floor === "upstairs")).toBe(true);
    // A full preferred floor falls back to a table that fits rather than crowding.
    const fallback = assignTables(pairRound(roster(10), [], 12).groups, DEFAULT_TABLES, "upstairs");
    expect(fallback.filter(a => a.floor === "upstairs")).toHaveLength(2);
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
function editableDraft(count = 8): Draft {
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
  it("keeps a four and a trio the same size after a swap", () => {
    const original = editableDraft(7);
    const swapped = swapDraftParticipants(original, original.groups[0][0].id, original.groups[1][0].id, "new-draft", DEFAULT_TABLES);
    expect(swapped.groups.map(group => group.length)).toEqual(original.groups.map(group => group.length));
    expect(swapped.groups.map(group => group.length)).toEqual([4, 3]);
    expect(swapped.groups.flat()).toHaveLength(7);
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
  it("rejects blocked tables but allows a swap at an overflowing table", () => {
    const draft = editableDraft(6);
    const ids = [draft.groups[0][0].id, draft.groups[1][0].id];
    const blocked = DEFAULT_TABLES.map(table => ({ ...table, available: false }));
    expect(() => swapDraftParticipants(draft, ids[0], ids[1], "new-draft", blocked)).toThrow("invalid_table_capacity");
    const crowded = { ...draft, assignments: draft.groups.map((_, groupIndex) => ({ groupIndex, tableNumber: 1, floor: "downstairs" as const })) };
    expect(swapDraftParticipants(crowded, ids[0], ids[1], "new-draft", DEFAULT_TABLES).assignments).toEqual(crowded.assignments);
    expect(() => swapDraftParticipants({ ...draft, assignments: draft.assignments.slice(1) }, ids[0], ids[1], "new-draft", DEFAULT_TABLES)).toThrow("invalid_table_capacity");
  });
});

it("spreads scarce English speakers and keeps both languages at every possible table", () => {
  const locals = Array.from({ length: 10 }, (_, i) => ({ id: `v${i}`, name: `Local ${i}`, speaks: ["vi"], learns: "en" }));
  const visitors = Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, name: `Visitor ${i}`, speaks: ["en"], learns: "vi" }));
  for (const group of pairRound([...locals, ...visitors], []).groups) {
    expect(group.some(p => p.speaks.includes("vi"))).toBe(true);
    expect(group.some(p => p.speaks.includes("en"))).toBe(true);
  }
});
it("prioritizes another matching learning language ahead of avoiding repeat partners", () => {
  const roster: Person[] = [
    { id: "vf", name: "Vietnamese French learner", speaks: ["vi"], learns: "fr" },
    { id: "vd", name: "Vietnamese German learner", speaks: ["vi"], learns: "de" },
    { id: "ef", name: "French speaker", speaks: ["en", "fr"], learns: "vi" },
    { id: "ed", name: "German speaker", speaks: ["en", "de"], learns: "vi" },
    { id: "x", name: "X", speaks: ["vi"], learns: "en" },
    { id: "y", name: "Y", speaks: ["vi"], learns: "en" },
  ];
  const prior: Round = { number: 1, startedAt: "2026-11-11T10:00:00Z", minutes: 20, groups: [[roster[0], roster[2]], [roster[1], roster[3]]] };
  const round = pairRound(roster, [prior]);
  expect(round.groups.find(g => g.some(p => p.id === "vf"))?.some(p => p.id === "ef")).toBe(true);
  expect(round.groups.find(g => g.some(p => p.id === "vd"))?.some(p => p.id === "ed")).toBe(true);
});
it("targets sixty percent upstairs for twenty players and honors closed floors", () => {
  const groups = pairRound(roster(20), []).groups;
  const assignments = assignTables(groups, DEFAULT_TABLES, "balanced");
  expect(assignments.filter(a => a.floor === "upstairs").reduce((n, a) => n + groups[a.groupIndex].length, 0)).toBe(12);
  expect(assignTables(groups, DEFAULT_TABLES.map(t => ({ ...t, available: t.floor === "downstairs" })), "balanced").every(a => a.floor === "downstairs")).toBe(true);
});

it("keeps other shared spoken languages together without losing Vietnamese/English coverage", () => {
  const roster: Person[] = [
    { id: "vf", name: "VF", speaks: ["vi", "fr"], learns: "en" },
    { id: "vd", name: "VD", speaks: ["vi", "de"], learns: "en" },
    { id: "ed", name: "ED", speaks: ["en", "de"], learns: "vi" },
    { id: "ef", name: "EF", speaks: ["en", "fr"], learns: "vi" },
    { id: "v", name: "V", speaks: ["vi"], learns: "en" },
    { id: "e", name: "E", speaks: ["en"], learns: "vi" },
  ];
  const groups = pairRound(roster, []).groups;
  expect(groups.find(g => g.some(p => p.id === "vf"))?.some(p => p.id === "ef")).toBe(true);
  expect(groups.find(g => g.some(p => p.id === "vd"))?.some(p => p.id === "ed")).toBe(true);
  for (const group of groups) {
    expect(group.some(p => p.speaks.includes("vi"))).toBe(true);
    expect(group.some(p => p.speaks.includes("en"))).toBe(true);
  }
});
