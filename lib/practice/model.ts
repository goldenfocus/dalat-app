import type { ArrivalParticipant } from "@/lib/arrival/types";

export type Participation = "playing" | "visiting" | "break" | "left" | "hosting";
export type Presence = "pending" | "present" | "absent";
export type FloorPolicy = "balanced" | "downstairs" | "upstairs";
export type Table = { number: number; floor: "downstairs" | "upstairs"; capacity: number; available: boolean; bar?: boolean };
export type TableAssignment = { groupIndex: number; tableNumber: number; floor: Table["floor"] };
export type Person = { id: string; name: string; speaks: string[]; learns: string | null; number?: number; avatarUrl?: string; learningLevel?: string | null; speakingLevels?: Record<string, string> };
export type Round = { number: number; startedAt: string; minutes: number; groups: Person[][]; endsAt?: string; pausedAt?: string; remainingSeconds?: number; endedAt?: string; changeoverEndsAt?: string; assignments?: TableAssignment[] };
export type Draft = { id: string; round: number; minutes: number; groups: Person[][]; assignments: TableAssignment[]; rosterFingerprint: string; createdAt: string };
export type PracticeState = { rounds: Round[]; participation?: Record<string, Participation>; presence?: Record<string, Exclude<Presence, "pending">>; numbers?: Record<string, number>; tables?: Table[]; floorPolicy?: FloorPolicy; draft?: Draft | null };
export type PracticeView = { canStart: boolean; count: number; round: Round | null; me: Person | null; groups: Person[][]; myGroup?: Person[]; myGroupNumber?: number | null; myTable?: TableAssignment | null; participation?: Participation | null; presence?: Presence | null; participants?: (Person & { participation: Participation; presence?: Presence })[]; revision?: number; serverNow?: string; tables?: Table[]; floorPolicy?: FloorPolicy; draft?: Draft | null };

export const DEFAULT_ROUND_MINUTES = 20;

/** Working furniture inventory, editable by the host. The bar starts unavailable. */
export const DEFAULT_TABLES: Table[] = [
  { number: 1, floor: "downstairs", capacity: 4, available: true },
  { number: 2, floor: "downstairs", capacity: 6, available: true },
  { number: 3, floor: "downstairs", capacity: 6, available: true },
  { number: 4, floor: "downstairs", capacity: 2, available: true },
  { number: 5, floor: "downstairs", capacity: 4, available: false, bar: true },
  { number: 6, floor: "downstairs", capacity: 2, available: true },
  { number: 7, floor: "downstairs", capacity: 2, available: true },
  ...[8, 9, 10, 11, 12].map(number => ({ number, floor: "upstairs" as const, capacity: 2, available: true })),
  ...[13, 14].map(number => ({ number, floor: "upstairs" as const, capacity: 4, available: true })),
];

export function arrivalPerson(p: ArrivalParticipant): Person {
  const prefs = p.language_preferences;
  return {
    id: p.id, name: p.nickname,
    speaks: prefs ? prefs.speaks.filter(s => ["native", "fluent", "intermediate"].includes(s.level)).map(s => s.language) : [],
    learns: prefs?.learning.language || (p.practice_language === "english" ? "en" : p.practice_language === "vietnamese" ? "vi" : null),
    ...(prefs ? { learningLevel: prefs.learning.level, speakingLevels: Object.fromEntries(prefs.speaks.map(s => [s.language, s.level])) } : {}),
  };
}

export function participantStatus(state: PracticeState, personId: string, staffIds: ReadonlySet<string> = new Set()): Participation {
  return state.participation?.[personId] || (staffIds.has(personId) ? "hosting" : "playing");
}

/** A check-in is history, not a roll-call answer. Preserve already-running games. */
export function presenceStatus(state: PracticeState, personId: string): Presence {
  return state.presence?.[personId] ?? (state.rounds.some(round => round.groups.some(group => group.some(person => person.id === personId))) ? "present" : "pending");
}

export function pendingPlayers(state: PracticeState, people: Person[], staffIds: ReadonlySet<string> = new Set()): Person[] {
  return people.filter(person => participantStatus(state, person.id, staffIds) === "playing" && presenceStatus(state, person.id) === "pending");
}

export function numberPeople(state: PracticeState, people: Person[]): Person[] {
  const numbers = { ...state.numbers };
  let next = Math.max(0, ...Object.values(numbers)) + 1;
  return people.map(p => ({ ...p, number: numbers[p.id] ?? (numbers[p.id] = next++) }));
}

export function eligiblePeople(state: PracticeState, people: Person[], staffIds: ReadonlySet<string> = new Set()): Person[] {
  return numberPeople(state, people).filter(p => participantStatus(state, p.id, staffIds) === "playing" && presenceStatus(state, p.id) === "present");
}

/** Comparing a draft to fresh arrival data also catches changed language preferences. */
export function rosterFingerprint(people: Person[], tables: Table[], floorPolicy: FloorPolicy): string {
  return JSON.stringify({ people: [...people].sort((a, b) => a.id.localeCompare(b.id)), tables: [...tables].sort((a, b) => a.number - b.number), floorPolicy });
}

/** Checked-in, playing identities are unique. Unknown language ability stays unknown. */
export function pairRound(people: Person[], previous: Round[], minutes = DEFAULT_ROUND_MINUTES, now = new Date()): Round {
  const roster = [...new Map(people.map(p => [p.id, p])).values()];
  if (roster.length < 2 || roster.length > 150) throw new Error("invalid_roster");
  const met = new Set<string>();
  const key = (a: string, b: string) => [a, b].sort().join(":");
  for (const round of previous) for (const group of round.groups)
    for (const a of group) for (const b of group) if (a.id !== b.id) met.add(key(a.id, b.id));
  const levels: Record<string, number> = { new: 0, beginner: 1, intermediate: 2, fluent: 3, native: 4 };
  const levelFit = (learner: Person, speaker: Person) => {
    if (!learner.learns || !learner.learningLevel) return 0;
    const known = speaker.speakingLevels?.[learner.learns];
    if (!known) return 0;
    return (levels[known] ?? 0) >= (levels[learner.learningLevel] ?? 0) ? 20 : -20;
  };
  const score = (a: Person, b: Person) =>
    (a.learns && b.speaks.includes(a.learns) ? 1000 : 0) +
    (b.learns && a.speaks.includes(b.learns) ? 1000 : 0) +
    (a.learns && b.learns && a.learns !== b.learns ? 100 : 0) +
    levelFit(a, b) + levelFit(b, a) - (met.has(key(a.id, b.id)) ? 300 : 0);
  let best: Person[][] = [], bestScore = -Infinity;
  for (let offset = 0; offset < roster.length; offset++) {
    const rest = [...roster.slice(offset), ...roster.slice(0, offset)], groups: Person[][] = [];
    while (rest.length > 1) {
      const a = rest.shift()!;
      let index = 0;
      for (let i = 1; i < rest.length; i++) if (score(a, rest[i]) > score(a, rest[index])) index = i;
      groups.push([a, rest.splice(index, 1)[0]]);
    }
    if (rest.length) {
      const extra = rest[0];
      let index = 0;
      for (let i = 1; i < groups.length; i++) if (groups[i].reduce((s, p) => s + score(extra, p), 0) > groups[index].reduce((s, p) => s + score(extra, p), 0)) index = i;
      groups[index].push(extra);
    }
    const total = groups.reduce((sum, g) => sum + g.reduce((s, a, i) => s + g.slice(i + 1).reduce((n, b) => n + score(a, b), 0), 0), 0);
    if (total > bestScore) { bestScore = total; best = groups; }
  }
  return { number: previous.length + 1, startedAt: now.toISOString(), endsAt: new Date(now.getTime() + minutes * 60_000).toISOString(), minutes, groups: best };
}

/** Pairs use small tables first. Shared larger tables retain distinct group numbers. */
export function assignTables(groups: Person[][], tables: Table[], policy: FloorPolicy): TableAssignment[] {
  const used = new Map<number, number>();
  const assignments: TableAssignment[] = [];
  const total = groups.reduce((sum, group) => sum + group.length, 0);
  const floorUsed = { downstairs: 0, upstairs: 0 };
  // Seat the only possible trio first so pairs cannot fragment its remaining capacity.
  const ordered = groups.map((group, groupIndex) => ({ group, groupIndex })).sort((a, b) => b.group.length - a.group.length);
  for (const { group, groupIndex } of ordered) {
    const candidates = tables.filter(t => t.available && t.capacity - (used.get(t.number) || 0) >= group.length);
    const rank = (t: Table) => {
      let floor = 0;
      if (policy !== "balanced") floor = t.floor === policy ? 0 : 1000;
      else if (total <= 10) floor = t.floor === "downstairs" ? 0 : 1000;
      else floor = floorUsed[t.floor] * 100;
      return (t.bar ? 100_000 : 0) + floor + t.capacity * 2 + (used.get(t.number) || 0) * 3;
    };
    candidates.sort((a, b) => rank(a) - rank(b) || a.number - b.number);
    const table = candidates[0];
    if (!table) throw new Error("invalid_table_capacity");
    used.set(table.number, (used.get(table.number) || 0) + group.length);
    floorUsed[table.floor] += group.length;
    assignments.push({ groupIndex, tableNumber: table.number, floor: table.floor });
  }
  return assignments.sort((a, b) => a.groupIndex - b.groupIndex);
}

/** Host review edit only: exchange existing members without changing seats or live rounds. */
export function swapDraftParticipants(draft: Draft, participantId: string, withParticipantId: string, newDraftId: string, tables: Table[]): Draft {
  const members = draft.groups.flat();
  const first = draft.groups.findIndex(group => group.some(person => person.id === participantId));
  const second = draft.groups.findIndex(group => group.some(person => person.id === withParticipantId));
  if (participantId === withParticipantId || first < 0 || second < 0 || first === second ||
      members.filter(person => person.id === participantId).length !== 1 ||
      members.filter(person => person.id === withParticipantId).length !== 1 ||
      !newDraftId || newDraftId === draft.id) throw new Error("invalid_draft_swap");
  const firstPerson = members.find(person => person.id === participantId)!;
  const secondPerson = members.find(person => person.id === withParticipantId)!;
  const groups = draft.groups.map(group => group.map(person => person.id === participantId ? secondPerson : person.id === withParticipantId ? firstPerson : person));
  const used = new Map<number, number>();
  if (draft.assignments.length !== groups.length || new Set(draft.assignments.map(a => a.groupIndex)).size !== groups.length) throw new Error("invalid_table_capacity");
  for (const assignment of draft.assignments) {
    const group = groups[assignment.groupIndex];
    const table = tables.find(t => t.number === assignment.tableNumber);
    if (!group || !table?.available || table.floor !== assignment.floor) throw new Error("invalid_table_capacity");
    const seats = (used.get(table.number) || 0) + group.length;
    if (seats > table.capacity) throw new Error("invalid_table_capacity");
    used.set(table.number, seats);
  }
  return { ...draft, id: newDraftId, groups };
}

export function remainingSeconds(round: Round, now = new Date()): number {
  if (round.endedAt) return 0;
  if (round.pausedAt) return Math.max(0, round.remainingSeconds || 0);
  return Math.max(0, Math.ceil((Date.parse(round.endsAt || new Date(Date.parse(round.startedAt) + round.minutes * 60_000).toISOString()) - now.getTime()) / 1000));
}

export function updateClock(round: Round, action: "pause" | "resume" | "extend" | "end", now = new Date(), seconds = 120): Round {
  if (round.endedAt) throw new Error("status_conflict");
  const remaining = remainingSeconds(round, now);
  if (action === "end") return { ...round, endedAt: now.toISOString(), pausedAt: undefined, remainingSeconds: 0, changeoverEndsAt: new Date(now.getTime() + 90_000).toISOString() };
  if (action === "pause") {
    if (round.pausedAt || remaining === 0) throw new Error("status_conflict");
    return { ...round, pausedAt: now.toISOString(), remainingSeconds: remaining };
  }
  if (action === "resume") {
    if (!round.pausedAt) throw new Error("status_conflict");
    return { ...round, pausedAt: undefined, remainingSeconds: undefined, endsAt: new Date(now.getTime() + remaining * 1000).toISOString() };
  }
  return round.pausedAt ? { ...round, remainingSeconds: remaining + seconds } : { ...round, endsAt: new Date(now.getTime() + (remaining + seconds) * 1000).toISOString() };
}

/** A participant receives only their own published assignment, never draft/other names. */
export function practiceView(state: PracticeState, people: Person[], ownId: string | null, canStart: boolean, revision = -1, staffIds: ReadonlySet<string> = new Set(), now = new Date()): PracticeView {
  const current = state.rounds.at(-1) || null;
  const groups = current?.groups || [];
  const myGroupIndex = groups.findIndex(g => g.some(p => p.id === ownId));
  const numbered = numberPeople(state, people);
  return {
    canStart, revision, serverNow: now.toISOString(),
    count: eligiblePeople(state, people, staffIds).length, me: numbered.find(p => p.id === ownId) || null,
    participation: ownId && people.some(p => p.id === ownId) ? participantStatus(state, ownId, staffIds) : null,
    presence: ownId && people.some(p => p.id === ownId) ? presenceStatus(state, ownId) : null,
    round: current ? { ...current, groups: [], assignments: canStart ? current.assignments : current.assignments?.filter(a => a.groupIndex === myGroupIndex) } : null,
    groups: canStart ? groups : groups.filter(g => g.some(p => p.id === ownId)),
    myGroup: myGroupIndex < 0 ? [] : groups[myGroupIndex],
    myGroupNumber: myGroupIndex < 0 ? null : myGroupIndex + 1,
    myTable: current?.assignments?.find(a => a.groupIndex === myGroupIndex) || null,
    tables: state.tables || DEFAULT_TABLES, floorPolicy: state.floorPolicy || "balanced",
    draft: canStart ? state.draft || null : null,
    ...(canStart ? { participants: numbered.map(p => ({ ...p, participation: participantStatus(state, p.id, staffIds), presence: presenceStatus(state, p.id) })) } : {}),
  };
}
