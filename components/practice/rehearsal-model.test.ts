import { describe, expect, it } from "vitest";
import { createRehearsal, mutateRehearsal, rehearsalView } from "./rehearsal-model";
function act(session: ReturnType<typeof createRehearsal>, action: Record<string, unknown>) { return mutateRehearsal(session, { ...action, expectedRevision: session.revision }); }
function confirmedRehearsal(count = 10) {
  let session = createRehearsal(count);
  for (const person of session.people.filter(person => !["sample-host", "sample-visitor"].includes(person.id))) session = act(session, { action: "presence", participantId: person.id, status: "present" });
  return session;
}
describe("isolated host rehearsal", () => {
  it("requires real roll-call choices and lets only the host undo an X", () => {
    let session = createRehearsal(3);
    expect(rehearsalView(session).count).toBe(0);
    expect(() => act(session, { action: "draft" })).toThrow("invalid_roster");
    session = act(session, { action: "presence", participantId: "sample-1", status: "present" });
    session = act(session, { action: "presence", participantId: "sample-2", status: "present" });
    const uncheckedDraft = act(session, { action: "draft" });
    expect(uncheckedDraft.state.draft?.groups.flat()).toHaveLength(2);
    const started = act(uncheckedDraft, { action: "start", draftId: uncheckedDraft.state.draft!.id });
    expect(started.state.rounds[0].groups.flat().map(person => person.id)).toContain("sample-3");
    expect(rehearsalView(started).count).toBe(2);
    session = act(session, { action: "presence", participantId: "sample-3", status: "absent" });
    expect(() => act({ ...session, mode: "attendee" }, { action: "presence", participantId: "sample-3", status: "present" })).toThrow("forbidden");
    session = act(session, { action: "draft" });
    expect(session.state.draft?.groups.flat()).toHaveLength(2);
    session = act(session, { action: "presence", participantId: "sample-3", status: "present" });
    expect(session.state.draft).toBeNull();
    session = act(session, { action: "draft" });
    expect(session.state.draft?.groups.flat()).toHaveLength(3);
  });
  it("keeps the working host and visiting guest out of a small real-model draft", () => {
    const initial = confirmedRehearsal();
    expect(rehearsalView(initial).count).toBe(10);
    const drafted = act(initial, { action: "draft", minutes: 12 });
    expect(drafted.state.rounds).toHaveLength(0);
    expect(drafted.state.draft?.groups.flat()).toHaveLength(10);
    expect(drafted.state.draft?.groups.flat().some(p => ["sample-host", "sample-visitor"].includes(p.id))).toBe(false);
    expect(drafted.state.draft?.assignments.filter(a => a.floor === "upstairs")).toHaveLength(2);
  });
  it("uses the real blocked-table allocator and runs two published sample rounds", () => {
    let session = confirmedRehearsal(34);
    session = act(session, { action: "settings", tables: session.state.tables!.map(t => ({ ...t, available: t.number === 4 ? false : t.available })), floorPolicy: "balanced" });
    session = act(session, { action: "draft", minutes: 12 });
    expect(session.state.draft?.assignments.some(a => a.tableNumber === 4)).toBe(false);
    expect(new Set(session.state.draft?.assignments.map(a => a.floor)).size).toBe(2);
    session = act(session, { action: "start", draftId: session.state.draft!.id });
    const guest = rehearsalView({ ...session, mode: "attendee" });
    expect([3, 4]).toContain(guest.myGroup?.length);
    expect(guest.myTable?.tableNumber).toBeTruthy();
    expect(guest.draft).toBeNull();
    expect(guest.participants).toBeUndefined();
    session = act(session, { action: "end" });
    session = act(session, { action: "draft", minutes: 12 });
    session = act(session, { action: "start", draftId: session.state.draft!.id });
    expect(session.state.rounds).toHaveLength(2);
    expect(session.state.rounds[1].number).toBe(2);
    expect(rehearsalView({ ...session, mode: "attendee" }).myGroup).not.toEqual(guest.myGroup);
  });
  it("seats a late sample arrival in the running round as soon as the host confirms them", () => {
    let session = createRehearsal(7);
    for (const id of ["sample-1", "sample-2", "sample-3", "sample-4", "sample-5", "sample-6"]) session = act(session, { action: "presence", participantId: id, status: "present" });
    session = act(session, { action: "draft" });
    session = act(session, { action: "start", draftId: session.state.draft!.id });
    expect(session.state.rounds[0].groups.map(group => group.length)).toEqual([3, 4]);
    session = act(session, { action: "presence", participantId: "sample-7", status: "present" });
    expect(session.state.rounds[0].groups.flat().map(person => person.id)).toContain("sample-7");
    expect(session.state.rounds[0].groups.map(group => group.length).sort()).toEqual([3, 4]);
    session = act(session, { action: "presence", participantId: "sample-visitor", status: "present" });
    expect(session.state.rounds[0].groups.flat().map(person => person.id)).not.toContain("sample-visitor");
  });
  it("enforces role/revision boundaries locally and leaves reset with no assignments", () => {
    const session = createRehearsal();
    expect(() => mutateRehearsal(session, { action: "draft", expectedRevision: -1, minutes: 12 })).toThrow("status_conflict");
    expect(() => act({ ...session, mode: "attendee" }, { action: "draft", minutes: 12 })).toThrow("forbidden");
    expect(rehearsalView(createRehearsal()).round).toBeNull();
  });
});

it("uses twenty-minute sample defaults and the same private host-only draft swaps", () => {
  let session = act(confirmedRehearsal(), { action: "draft" });
  expect(session.state.draft?.minutes).toBe(20);
  const original = session.state.draft!;
  const first = original.groups[0][0], second = original.groups[1][0];
  const payload = { action: "swap", draftId: original.id, participantId: first.id, withParticipantId: second.id };
  expect(() => act({ ...session, mode: "attendee" }, payload)).toThrow("forbidden");
  session = act(session, payload);
  expect(session.state.draft?.id).not.toBe(original.id);
  expect(session.state.draft?.groups[0][0].id).toBe(second.id);
  expect(session.state.draft?.assignments).toEqual(original.assignments);
  expect(rehearsalView({ ...session, mode: "attendee" }).draft).toBeNull();
  expect(() => act(session, { action: "start", draftId: original.id })).toThrow("status_conflict");
  session = act(session, { action: "start", draftId: session.state.draft!.id });
  expect(session.state.rounds[0].minutes).toBe(20);
  expect(session.state.rounds[0].groups[0][0].id).toBe(second.id);
});
