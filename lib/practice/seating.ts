import {
  assignTables,
  DEFAULT_TABLES,
  pairRound,
  hasMixedLanguagePair,
  participantStatus,
  presenceStatus,
  type Person,
  type PracticeState,
  type Seating,
  type Table,
} from "./model";

/** Reconcile identities before planning; a later check-in retains its RSVP seat. */
export function remapSeatingIdentity(
  state: PracticeState,
  aliases: ReadonlyMap<string, string>,
): PracticeState {
  const id = (value: string) => aliases.get(value) || value;
  const map = <T>(record: Record<string, T> | undefined) =>
    record &&
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [id(key), value]),
    );
  const groups = (value: Person[][]) =>
    value.map((group) =>
      group.map((person) => ({ ...person, id: id(person.id) })),
    );
  return {
    ...state,
    numbers: map(state.numbers),
    presence: map(state.presence),
    participation: map(state.participation),
    rounds: state.rounds.map((round) => ({
      ...round,
      groups: groups(round.groups),
    })),
    ...(state.seating
      ? { seating: { ...state.seating, groups: groups(state.seating.groups) } }
      : {}),
    ...(state.draft
      ? { draft: { ...state.draft, groups: groups(state.draft.groups) } }
      : {}),
  };
}

function newAssignment(
  seating: Seating,
  tables: Table[],
  state: PracticeState,
  index: number,
) {
  const used = new Set(seating.assignments.map((a) => a.tableNumber));
  const free = tables.filter(
    (table) => table.available && !used.has(table.number),
  );
  if (!free.length) return undefined;
  const available = free;
  const upstairs = seating.assignments.reduce(
    (sum, a) =>
      sum + (a.floor === "upstairs" ? seating.groups[a.groupIndex].length : 0),
    0,
  );
  const total = seating.groups.reduce((sum, group) => sum + group.length, 0);
  const policy =
    state.floorPolicy && state.floorPolicy !== "balanced"
      ? state.floorPolicy
      : upstairs < total * 0.6
        ? "upstairs"
        : "downstairs";
  return {
    ...assignTables([seating.groups[index]], available, policy)[0],
    groupIndex: index,
    mixedReady: true,
  };
}

/** Assign only checked-in mixed groups; keep unmatched guests in a waiting pool. */
export function planSeating(
  state: PracticeState,
  people: Person[],
  staffIds: ReadonlySet<string> = new Set(),
): Seating {
  const players = people.filter(p => participantStatus(state, p.id, staffIds) === "playing");
  const present = players.filter(p => presenceStatus(state, p.id, p) === "present");
  const tables = state.tables || DEFAULT_TABLES;
  const previous = state.seating || (state.rounds.at(-1)?.assignments ? {
    groups: state.rounds.at(-1)!.groups, assignments: state.rounds.at(-1)!.assignments!, locked: true,
  } : undefined);
  const current = new Map(players.map(p => [p.id, p]));
  const seated = new Set<string>();
  const seating: Seating = { groups: [], assignments: [], locked: true };
  // Preserve existing physical seats, including a temporarily absent partner.
  for (const assignment of previous?.assignments || []) {
    const group = (previous!.groups[assignment.groupIndex] || [])
      .filter(p => current.has(p.id) && !seated.has(p.id)).map(p => current.get(p.id)!);
    const readyNow = hasMixedLanguagePair(group.filter(p => presenceStatus(state, p.id, p) === "present"));
    if (!group.length || (!assignment.mixedReady && !readyNow)) continue;
    group.forEach(p => seated.add(p.id));
    seating.assignments.push({ ...assignment, groupIndex: seating.groups.length, mixedReady: true });
    seating.groups.push(group);
  }
  // Form new mixed groups before using spare seats, so waiting language partners meet.
  const waiting = present.filter(p => !seated.has(p.id));
  const candidates = waiting.length >= 2 ? pairRound(waiting, state.rounds).groups.filter(hasMixedLanguagePair) : [];
  const free = tables.filter(t => t.available && !seating.assignments.some(a => a.tableNumber === t.number));
  const ready = candidates.slice(0, free.length);
  if (!seating.groups.length) {
    seating.groups = ready;
    seating.assignments = assignTables(ready, free, state.floorPolicy || "balanced").map(a => ({...a, mixedReady: true}));
    ready.flat().forEach(p => seated.add(p.id));
  } else {
    for (const group of ready) {
      seating.groups.push(group);
      const assignment = newAssignment(seating, tables, state, seating.groups.length - 1);
      if (assignment) { seating.assignments.push(assignment); group.forEach(p => seated.add(p.id)); }
      else seating.groups.pop();
    }
  }
  // Late arrivals can join a mixed table without moving anyone already seated.
  for (const person of present.filter(p => !seated.has(p.id))) {
    const options = seating.groups.map((group, index) => ({ group, index }))
      .filter(({ group, index }) => group.length < 4 && seating.assignments.some(a => a.groupIndex === index));
    const cost = (group: Person[]) => group.length * 10 - group.filter(p =>
      (p.learningLanguages || [p.learns]).some(language => language && person.speaks.includes(language)) ||
      (person.learningLanguages || [person.learns]).some(language => language && p.speaks.includes(language)),
    ).length;
    const target = options.sort((a, b) => cost(a.group) - cost(b.group) || a.index - b.index)[0];
    if (target) { target.group.push(person); seated.add(person.id); }
  }
  // Unassigned groups are host-only waiting lists, never physical table reservations.
  const remaining = players.filter(p => !seated.has(p.id));
  for (let i = 0; i < remaining.length; i += 4) seating.groups.push(remaining.slice(i, i + 4));
  return seating;
}

export function moveSeat(
  seating: Seating,
  personId: string,
  options: { withPersonId?: string; tableNumber?: number },
): Seating {
  const groups = seating.groups.map((group) => [...group]);
  const from = groups.findIndex((group) =>
    group.some((p) => p.id === personId),
  );
  if (from < 0) throw new Error("participant_not_found");
  const person = groups[from].find((p) => p.id === personId)!;
  if (options.withPersonId) {
    const to = groups.findIndex((group) =>
      group.some((p) => p.id === options.withPersonId),
    );
    if (to < 0) throw new Error("participant_not_found");
    if (to === from) return seating;
    const other = groups[to].find((p) => p.id === options.withPersonId)!;
    groups[from] = groups[from].map((p) => (p.id === personId ? other : p));
    groups[to] = groups[to].map((p) => (p.id === other.id ? person : p));
  } else {
    const to = seating.assignments.find(
      (a) => a.tableNumber === options.tableNumber,
    )?.groupIndex;
    if (to === undefined) throw new Error("invalid_table_capacity");
    if (from === to) return seating;
    if (groups[to].length >= 4) throw new Error("invalid_table_capacity");
    groups[from] = groups[from].filter((p) => p.id !== personId);
    groups[to].push(person);
  }
  return { groups, assignments: seating.assignments, locked: true };
}
