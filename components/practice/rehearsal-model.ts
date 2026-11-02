import { assignTables, DEFAULT_ROUND_MINUTES, DEFAULT_TABLES, eligiblePeople, numberPeople, pairRound, practiceView, remainingSeconds, rosterFingerprint, swapDraftParticipants, updateClock, type FloorPolicy, type Participation, type Person, type PracticeState, type Table } from "@/lib/practice/model";

/** Entirely synthetic, browser-memory-only state. Never reads or writes an event API. */
export type Rehearsal = { state: PracticeState; revision: number; people: Person[]; mode: "host" | "attendee" };
export function createRehearsal(count = 10): Rehearsal {
  const names = ["Mai", "Alex", "Linh", "Sam", "An", "Taylor", "Minh", "Robin", "Hoa", "Jamie"];
  const people: Person[] = Array.from({ length: count }, (_, i) => ({ id: `sample-${i + 1}`, name: `${names[i % names.length]}${i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ""}`, speaks: [i % 2 ? "en" : "vi"], learns: i % 2 ? "vi" : "en", learningLevel: i % 3 ? "beginner" : "intermediate", speakingLevels: { [i % 2 ? "en" : "vi"]: "native" } }));
  people.push({ id: "sample-host", name: "Morgan", speaks: ["en"], learns: "vi" }, { id: "sample-visitor", name: "Casey", speaks: ["en"], learns: "vi" });
  let state: PracticeState = { rounds: [], participation: { "sample-host": "hosting", "sample-visitor": "visiting" }, tables: DEFAULT_TABLES.map(t => ({ ...t })), floorPolicy: "balanced" };
  state = { ...state, numbers: Object.fromEntries(numberPeople(state, people).map(p => [p.id, p.number!])) };
  return { state, revision: 0, people, mode: "host" };
}
export function rehearsalView(session: Rehearsal, now = new Date()) {
  return practiceView(session.state, session.people, session.mode === "attendee" ? session.people[0].id : "sample-host", session.mode === "host", session.revision, new Set(["sample-host"]), now);
}
export function mutateRehearsal(session: Rehearsal, payload: Record<string, unknown>, now = new Date()): Rehearsal {
  if (payload.expectedRevision !== session.revision) throw new Error("status_conflict");
  let state = session.state;
  const host = session.mode === "host";
  if (payload.action === "participation") {
    const id = String(payload.participantId || (host ? "sample-host" : session.people[0].id));
    if (!session.people.some(p => p.id === id) || !host && id !== session.people[0].id) throw new Error("forbidden");
    state = { ...state, participation: { ...state.participation, [id]: payload.status as Participation }, draft: null };
  } else if (!host) throw new Error("forbidden");
  else if (payload.action === "settings") state = { ...state, tables: payload.tables as Table[], floorPolicy: payload.floorPolicy as FloorPolicy, draft: null };
  else if (payload.action === "draft") {
    const players = eligiblePeople(state, session.people, new Set(["sample-host"]));
    const candidate = pairRound(players, state.rounds, payload.minutes === undefined ? DEFAULT_ROUND_MINUTES : Number(payload.minutes), now);
    const tables = state.tables || DEFAULT_TABLES;
    const floor = state.floorPolicy || "balanced";
    state = { ...state, draft: { id: crypto.randomUUID(), round: candidate.number, minutes: candidate.minutes, groups: candidate.groups, assignments: assignTables(candidate.groups, tables, floor), rosterFingerprint: rosterFingerprint(players, tables, floor), createdAt: now.toISOString() } };
  } else if (payload.action === "swap") {
    const draft = state.draft;
    if (!draft || draft.id !== payload.draftId || draft.round !== state.rounds.length + 1) throw new Error("status_conflict");
    if (draft.rosterFingerprint !== rosterFingerprint(eligiblePeople(state, session.people, new Set(["sample-host"])), state.tables || DEFAULT_TABLES, state.floorPolicy || "balanced")) throw new Error("status_conflict");
    state = { ...state, draft: swapDraftParticipants(draft, String(payload.participantId), String(payload.withParticipantId), crypto.randomUUID(), state.tables || DEFAULT_TABLES) };
  } else if (payload.action === "start") {
    const draft = state.draft;
    const current = state.rounds.at(-1);
    if (!draft || draft.id !== payload.draftId || current && !current.endedAt && (current.pausedAt || remainingSeconds(current, now) > 0)) throw new Error("status_conflict");
    if (draft.rosterFingerprint !== rosterFingerprint(eligiblePeople(state, session.people, new Set(["sample-host"])), state.tables || DEFAULT_TABLES, state.floorPolicy || "balanced")) throw new Error("status_conflict");
    state = { ...state, rounds: [...state.rounds, { number: draft.round, minutes: draft.minutes, groups: draft.groups, assignments: draft.assignments, startedAt: now.toISOString(), endsAt: new Date(now.getTime() + draft.minutes * 60_000).toISOString() }], draft: null };
  } else if (["pause", "resume", "end", "extend"].includes(String(payload.action))) {
    const current = state.rounds.at(-1);
    if (!current) throw new Error("status_conflict");
    state = { ...state, rounds: [...state.rounds.slice(0, -1), updateClock(current, payload.action as "pause" | "resume" | "end" | "extend", now, Number(payload.seconds) || undefined)] };
  } else throw new Error("invalid_request");
  return { ...session, state, revision: session.revision + 1 };
}
