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

const LEGACY_SPEAKING_LEVELS: readonly string[] = ["comfortable", "advanced", "fluent", "native"];

export function arrivalPerson(p: ArrivalParticipant): Person {
  const prefs = p.language_preferences;
  // Quick door check-ins have no full profile: a comfortable legacy level still shows who can help at a table.
  const legacySpeaks = [
    ...(p.vietnamese_level && LEGACY_SPEAKING_LEVELS.includes(p.vietnamese_level) ? ["vi"] : []),
    ...(p.english_level && LEGACY_SPEAKING_LEVELS.includes(p.english_level) ? ["en"] : []),
  ];
  return {
    id: p.id, name: p.nickname,
    speaks: prefs ? prefs.speaks.filter(s => ["native", "fluent", "intermediate"].includes(s.level)).map(s => s.language) : legacySpeaks,
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

const pairKey = (a: string, b: string) => [a, b].sort().join(":");
function metPairs(rounds: Round[]): Set<string> {
  const met = new Set<string>();
  for (const round of rounds) for (const group of round.groups)
    for (const a of group) for (const b of group) if (a.id !== b.id) met.add(pairKey(a.id, b.id));
  return met;
}
const speaksVietnamese = (person: Person) => person.speaks.includes("vi");

/**
 * Checked-in, playing identities are unique. Tables of three or four survive a
 * no-show; Vietnamese speakers are spread first so each table has one when possible.
 */
export function pairRound(people: Person[], previous: Round[], minutes = DEFAULT_ROUND_MINUTES, now = new Date()): Round {
  const roster = [...new Map(people.map(p => [p.id, p])).values()];
  if (roster.length < 2 || roster.length > 150) throw new Error("invalid_roster");
  const met = metPairs(previous);
  const count = Math.max(1, Math.round(roster.length / 3.5));
  const targets = Array.from({ length: count }, (_, i) => Math.floor(roster.length / count) + (i < roster.length % count ? 1 : 0));
  const anchors = roster.filter(speaksVietnamese).sort((a, b) => Number(a.speaks.includes("en")) - Number(b.speaks.includes("en")));
  const seeded = anchors.slice(0, count);
  const others = [...anchors.slice(count), ...roster.filter(p => !speaksVietnamese(p))];
  const foreignMatch = (a: Person, b: Person) =>
    (a.learns && !["en", "vi"].includes(a.learns) && b.speaks.includes(a.learns) ? 1 : 0) +
    (b.learns && !["en", "vi"].includes(b.learns) && a.speaks.includes(b.learns) ? 1 : 0);
  const cost = (person: Person, group: Person[]) => group.reduce((sum, member) =>
    sum + (met.has(pairKey(person.id, member.id)) ? 30 : 0) + (member.learns === person.learns ? 4 : 0) - foreignMatch(person, member) * 100, group.length);
  const score = (groups: Person[][]) => groups.reduce((sum, group) => sum +
    (["vi", "en"].filter(language => !group.some(p => p.speaks.includes(language))).length * 1_000_000) +
    group.reduce((total, person, i) => total + cost(person, group.slice(i + 1)), 0), 0);
  let best: Person[][] = [], bestCost = Infinity;
  // Deterministic: try each rotation of the remaining roster and keep the cheapest seating.
  for (let offset = 0; offset < Math.max(1, others.length); offset++) {
    const groups: Person[][] = targets.map((_, i) => seeded[i] ? [seeded[i]] : []);
    // Cover English before filling remaining seats; keep bilingual hosts useful.
    const assigned = new Set(groups.flat().map(p => p.id));
    for (const group of groups) {
      if (group.some(p => p.speaks.includes("en"))) continue;
      const speaker = others.find(p => !assigned.has(p.id) && p.speaks.includes("en"));
      if (speaker) { group.push(speaker); assigned.add(speaker.id); }
    }
    for (const person of [...others.slice(offset), ...others.slice(0, offset)]) {
      if (assigned.has(person.id)) continue;
      let index = -1, lowest = Infinity;
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].length >= targets[i]) continue;
        const value = cost(person, groups[i]);
        if (value < lowest) { lowest = value; index = i; }
      }
      groups[index].push(person);
    }
    const total = score(groups);
    if (total < bestCost) { bestCost = total; best = groups; }
  }
  // Improve secondary language matches without losing English/Vietnamese coverage.
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let a = 0; a < best.length; a++) for (let b = a + 1; b < best.length; b++) {
      for (let i = 0; i < best[a].length; i++) for (let j = 0; j < best[b].length; j++) {
        const before = score([best[a], best[b]]);
        [best[a][i], best[b][j]] = [best[b][j], best[a][i]];
        if (score([best[a], best[b]]) < before) improved = true;
        else [best[a][i], best[b][j]] = [best[b][j], best[a][i]];
      }
    }
    if (!improved) break;
  }
  return { number: previous.length + 1, startedAt: now.toISOString(), endsAt: new Date(now.getTime() + minutes * 60_000).toISOString(), minutes, groups: best };
}

function chooseTable(tables: Table[], used: Map<number, number>, floorUsed: Record<Table["floor"], number>, size: number, total: number, policy: FloorPolicy, pullUpChairs = false): Table | undefined {
  const remaining = (t: Table) => t.capacity - (used.get(t.number) || 0);
  const available = tables.filter(t => t.available);
  const rank = (t: Table) => {
    let floor = 0;
    if (policy !== "balanced") floor = t.floor === policy ? 0 : 1000;
    else {
      const seated = floorUsed.upstairs + floorUsed.downstairs + size;
      const upstairs = floorUsed.upstairs + (t.floor === "upstairs" ? size : 0);
      floor = Math.abs(upstairs - seated * 0.6) * 100;
    }
    return (t.bar ? 100_000 : 0) + floor + t.capacity * 2 + (used.get(t.number) || 0) * 3;
  };
  if (pullUpChairs && policy !== "balanced") {
    // The existing soft seating rule permits two pulled-up chairs at an unused table.
    const preferred = available.filter(t => t.floor === policy && !used.has(t.number) && t.capacity + 2 >= size)
      .sort((a, b) => Number(!!a.bar) - Number(!!b.bar) || Math.max(0, size - a.capacity) - Math.max(0, size - b.capacity) || a.capacity - b.capacity || a.number - b.number);
    if (preferred[0]) return preferred[0];
  }
  const fits = available.filter(t => remaining(t) >= size).sort((a, b) => rank(a) - rank(b) || a.number - b.number);
  if (fits[0]) return fits[0];
  // Never stop the game for seats: people pull up a chair at the roomiest open table.
  return available.sort((a, b) => Number(!!a.bar) - Number(!!b.bar) || remaining(b) - remaining(a) || rank(a) - rank(b) || a.number - b.number)[0];
}

/** Groups prefer a table that fits; shared larger tables retain distinct group numbers. */
export function assignTables(groups: Person[][], tables: Table[], policy: FloorPolicy): TableAssignment[] {
  const used = new Map<number, number>();
  const assignments: TableAssignment[] = [];
  const total = groups.reduce((sum, group) => sum + group.length, 0);
  const floorUsed = { downstairs: 0, upstairs: 0 };
  // Pick whole groups closest to 60% upstairs, rather than rounding each group.
  const choices = new Map<number, number[]>([[0, []]]);
  for (let i = 0; i < groups.length; i++) for (const [sum, indices] of [...choices]) {
    const next = sum + groups[i].length;
    if (!choices.has(next)) choices.set(next, [...indices, i]);
  }
  const upstairs = new Set([...choices].sort((a, b) => Math.abs(a[0] - total * 0.6) - Math.abs(b[0] - total * 0.6) || b[0] - a[0])[0][1]);
  // Seat larger groups first so smaller ones cannot fragment the remaining capacity.
  const ordered = groups.map((group, groupIndex) => ({ group, groupIndex })).sort((a, b) => b.group.length - a.group.length);
  for (const { group, groupIndex } of ordered) {
    const table = chooseTable(tables, used, floorUsed, group.length, total, policy === "balanced" ? upstairs.has(groupIndex) ? "upstairs" : "downstairs" : policy, policy === "balanced");
    if (!table) throw new Error("invalid_table_capacity");
    used.set(table.number, (used.get(table.number) || 0) + group.length);
    floorUsed[table.floor] += group.length;
    assignments.push({ groupIndex, tableNumber: table.number, floor: table.floor });
  }
  return assignments.sort((a, b) => a.groupIndex - b.groupIndex);
}

export const LATE_GROUP_LIMIT = 5;

export function roundIsLive(round: Round | undefined | null, now = new Date()): round is Round {
  return !!round && !round.endedAt && (!!round.pausedAt || remainingSeconds(round, now) > 0);
}

/**
 * A confirmed arrival joins the running round at once instead of waiting for the
 * next draft. Nobody already seated moves. When every table is full a new one opens.
 */
export function seatLateArrival(state: PracticeState, person: Person, now = new Date()): PracticeState {
  const current = state.rounds.at(-1);
  if (!roundIsLive(current, now) || current.groups.some(group => group.some(member => member.id === person.id))) return state;
  const met = metPairs(state.rounds.slice(0, -1));
  const metCount = (group: Person[]) => group.filter(member => met.has(pairKey(person.id, member.id))).length;
  const open = current.groups.map((group, index) => ({ group, index })).filter(({ group }) => group.length < LATE_GROUP_LIMIT);
  const lackingVietnamese = speaksVietnamese(person) ? open.filter(({ group }) => !group.some(speaksVietnamese)) : [];
  const target = (lackingVietnamese.length ? lackingVietnamese : open)
    .sort((a, b) => a.group.length - b.group.length || metCount(a.group) - metCount(b.group) || a.index - b.index)[0];
  let round: Round;
  if (target) {
    round = { ...current, groups: current.groups.map((group, index) => index === target.index ? [...group, person] : group) };
  } else {
    const groups = [...current.groups, [person]];
    round = { ...current, groups };
    if (current.assignments) {
      const tables = state.tables || DEFAULT_TABLES;
      const used = new Map<number, number>();
      const floorUsed = { downstairs: 0, upstairs: 0 };
      for (const assignment of current.assignments) {
        const size = current.groups[assignment.groupIndex]?.length || 0;
        used.set(assignment.tableNumber, (used.get(assignment.tableNumber) || 0) + size);
        floorUsed[assignment.floor] += size;
      }
      // Reserve room for the next arrivals who will join this new table.
      const table = chooseTable(tables, used, floorUsed, 3, groups.flat().length, state.floorPolicy || "balanced");
      if (table) round.assignments = [...current.assignments, { groupIndex: groups.length - 1, tableNumber: table.number, floor: table.floor }];
    }
  }
  return { ...state, rounds: [...state.rounds.slice(0, -1), round] };
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
  if (draft.assignments.length !== groups.length || new Set(draft.assignments.map(a => a.groupIndex)).size !== groups.length) throw new Error("invalid_table_capacity");
  for (const assignment of draft.assignments) {
    const group = groups[assignment.groupIndex];
    const table = tables.find(t => t.number === assignment.tableNumber);
    if (!group || !table?.available || table.floor !== assignment.floor) throw new Error("invalid_table_capacity");
    // Seating is soft (people pull up chairs) and a swap keeps every group size unchanged.
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
