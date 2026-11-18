import { describe, expect, it } from "vitest";
import { moveSeat, planSeating, remapSeatingIdentity } from "./seating";
import { practiceView, type Person, type PracticeState } from "./model";
const roster = (count: number): Person[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    speaks: [i % 2 ? "en" : "vi"],
    learns: i % 2 ? "vi" : "en",
    arrived: false,
  }));
describe("RSVP seating", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 19, 30])(
    "keeps every RSVP waiting before arrival: %i",
    (count) => {
      const people = roster(count),
        seating = planSeating({ rounds: [] }, people);
      expect(
        seating.groups
          .flat()
          .map((p) => p.id)
          .sort(),
      ).toEqual(people.map((p) => p.id).sort());
      expect(seating.groups.every((g) => g.length <= 4)).toBe(true);
      const view = practiceView(
        { rounds: [], seating },
        people,
        people[0].id,
        false,
      );
      expect(view.myTable).toBeNull();
      expect(view.round).toBeNull();
      expect(view.count).toBe(0);
      expect(view.groups).toHaveLength(0);
      expect(view.participants).toBeUndefined();
    },
  );
  it("keeps RSVP seats as guests arrive, and does not mark other RSVPs present", () => {
    const people = roster(8).map(p=>({...p,arrived:true})),
      before = planSeating({ rounds: [] }, people);
    people[0].arrived = true;
    const after = planSeating({ rounds: [], seating: before }, people);
    expect(after.groups.map((g) => g.map((p) => p.id))).toEqual(
      before.groups.map((g) => g.map((p) => p.id)),
    );
    expect(after.assignments).toEqual(before.assignments);
    const state = { rounds: [], seating: after };
    expect(practiceView(state, people, "p0", false).count).toBe(8);
    expect(practiceView(state, people, "p1", false).presence).toBe("present");
  });
  it("retains the same seat when a logged-in RSVP gets its arrival ID", () => {
    const before = planSeating({ rounds: [] }, roster(8).map(p=>({...p,arrived:true})));
    const state = remapSeatingIdentity(
      { rounds: [], seating: before, presence: { p0: "present" } },
      new Map([["p0", "arrival0"]]),
    );
    const people = roster(8).map(p=>({...p,arrived:true}));
    people[0] = { ...people[0], id: "arrival0", arrived: true };
    const after = planSeating(state, people);
    expect(after.assignments).toEqual(before.assignments);
    expect(
      after.groups.findIndex((g) => g.some((p) => p.id === "arrival0")),
    ).toBe(before.groups.findIndex((g) => g.some((p) => p.id === "p0")));
    expect(state.presence?.arrival0).toBe("present");
  });
  it("supports explicit swaps and moves without dropping or duplicating players", () => {
    const people = roster(7).map(p=>({...p,arrived:true})),
      seating = planSeating({ rounds: [] }, people);
    const a = seating.groups[0][0],
      b = seating.groups[1][0];
    const swapped = moveSeat(seating, a.id, { withPersonId: b.id });
    expect(swapped.groups[1].some((p) => p.id === a.id)).toBe(true);
    expect(swapped.locked).toBe(true);
    const moved = moveSeat(seating, a.id, {
      tableNumber: seating.assignments[1].tableNumber,
    });
    expect(moved.groups.flat()).toHaveLength(7);
    expect(new Set(moved.groups.flat().map((p) => p.id)).size).toBe(7);
    expect(() =>
      moveSeat(moved, b.id, {
        tableNumber: seating.assignments[1].tableNumber,
      }),
    ).not.toThrow();
    expect(() =>
      moveSeat(moved, seating.groups[0][1].id, {
        tableNumber: seating.assignments[1].tableNumber,
      }),
    ).toThrow("invalid_table_capacity");
  });
  it("new arrivals do not move anyone already assigned", () => {
    const people = roster(8).map(p=>({...p,arrived:true})),
      state: PracticeState = {
        rounds: [],
        seating: planSeating({ rounds: [] }, people),
      };
    state.seating!.locked = true;
    const next = planSeating(state, roster(9).map(p=>({...p,arrived:true})));
    for (const p of people) {
      const i = state.seating!.groups.findIndex((g) =>
        g.some((x) => x.id === p.id),
      );
      const j = next.groups.findIndex((g) => g.some((x) => x.id === p.id));
      expect(next.assignments[j].tableNumber).toBe(
        state.seating!.assignments[i].tableNumber,
      );
    }
  });
});

it("waits for Vietnamese-English mixing, then assigns tables without moving seated guests", () => {
  const english = Array.from({length:4}, (_, i) => ({id:`en${i}`,name:`English ${i}`,speaks:["en"],learns:"vi",arrived:true}));
  const first = planSeating({ rounds: [] }, english);
  expect(first.assignments).toHaveLength(0);
  expect(practiceView({rounds:[],seating:first},english,"en0",false).myGroup).toEqual([]);
  const vietnamese = [0,1].map(i => ({id:`vi${i}`,name:`Vietnamese ${i}`,speaks:["vi"],learns:"en",arrived:true}));
  const next = planSeating({rounds:[],seating:first}, [...english,...vietnamese]);
  expect(next.assignments).toHaveLength(2);
  for (const a of next.assignments) {
    expect(next.groups[a.groupIndex].some(p=>p.speaks.includes("vi"))).toBe(true);
    expect(next.groups[a.groupIndex].some(p=>p.speaks.includes("en"))).toBe(true);
  }
  const late = {...english[0],id:"late"};
  const after = planSeating({rounds:[],seating:next}, [...english,...vietnamese,late]);
  for (const person of [...english,...vietnamese]) {
    const before = next.groups.findIndex(g=>g.some(p=>p.id===person.id));
    const later = after.groups.findIndex(g=>g.some(p=>p.id===person.id));
    expect(after.assignments.find(a=>a.groupIndex===later)?.tableNumber).toBe(next.assignments.find(a=>a.groupIndex===before)?.tableNumber);
  }
});
it("does not create a physical table from RSVP-only language matches", () => {
  const people = roster(8);
  expect(planSeating({rounds:[]}, people).assignments).toHaveLength(0);
  people[0].arrived=true;
  expect(planSeating({rounds:[]}, people).assignments).toHaveLength(0);
  people[1].arrived=true;
  const seating=planSeating({rounds:[]}, people);
  expect(seating.assignments).toHaveLength(1);
  expect(seating.groups[seating.assignments[0].groupIndex]).toHaveLength(2);
});
it("keeps extra groups waiting when physical tables run out", () => {
  const people=roster(8).map(p=>({...p,arrived:true}));
  const seating=planSeating({rounds:[],tables:[{number:1,floor:"upstairs",capacity:4,available:true}]},people);
  expect(seating.assignments).toHaveLength(1);
  expect(seating.groups.flat()).toHaveLength(8);
  expect(seating.groups[0]).toHaveLength(4);
});
