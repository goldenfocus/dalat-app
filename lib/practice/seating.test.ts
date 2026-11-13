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
    "seats every RSVP exactly once before arrival: %i",
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
      expect(view.myTable).toBeTruthy();
      expect(view.round).toBeNull();
      expect(view.count).toBe(0);
      expect(view.groups).toHaveLength(1);
      expect(view.participants).toBeUndefined();
    },
  );
  it("keeps RSVP seats as guests arrive, and does not mark other RSVPs present", () => {
    const people = roster(8),
      before = planSeating({ rounds: [] }, people);
    people[0].arrived = true;
    const after = planSeating({ rounds: [], seating: before }, people);
    expect(after.groups.map((g) => g.map((p) => p.id))).toEqual(
      before.groups.map((g) => g.map((p) => p.id)),
    );
    expect(after.assignments).toEqual(before.assignments);
    const state = { rounds: [], seating: after };
    expect(practiceView(state, people, "p0", false).count).toBe(1);
    expect(practiceView(state, people, "p1", false).presence).toBe("pending");
  });
  it("retains the same seat when a logged-in RSVP gets its arrival ID", () => {
    const before = planSeating({ rounds: [] }, roster(8));
    const state = remapSeatingIdentity(
      { rounds: [], seating: before, presence: { p0: "present" } },
      new Map([["p0", "arrival0"]]),
    );
    const people = roster(8);
    people[0] = { ...people[0], id: "arrival0", arrived: true };
    const after = planSeating(state, people);
    expect(after.assignments).toEqual(before.assignments);
    expect(
      after.groups.findIndex((g) => g.some((p) => p.id === "arrival0")),
    ).toBe(before.groups.findIndex((g) => g.some((p) => p.id === "p0")));
    expect(state.presence?.arrival0).toBe("present");
  });
  it("supports explicit swaps and moves without dropping or duplicating players", () => {
    const people = roster(7),
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
    const people = roster(8),
      state: PracticeState = {
        rounds: [],
        seating: planSeating({ rounds: [] }, people),
      };
    state.seating!.locked = true;
    const next = planSeating(state, roster(9));
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
