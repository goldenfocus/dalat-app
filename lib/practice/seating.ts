import {
  assignTables,
  DEFAULT_TABLES,
  pairRound,
  participantStatus,
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
  const available = free.length ? free : tables;
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
  };
}

/** RSVP plans can rebalance until arrival. Thereafter only explicit host moves change seats. */
export function planSeating(
  state: PracticeState,
  people: Person[],
  staffIds: ReadonlySet<string> = new Set(),
): Seating {
  const players = people.filter(
    (p) => participantStatus(state, p.id, staffIds) === "playing",
  );
  const tables = state.tables || DEFAULT_TABLES;
  const previous =
    state.seating ||
    (state.rounds.at(-1)?.assignments
      ? {
          groups: state.rounds.at(-1)!.groups,
          assignments: state.rounds.at(-1)!.assignments!,
          locked: true,
        }
      : null);
  const locked =
    previous?.locked ||
    players.some((p) => p.arrived || state.presence?.[p.id] === "present");
  if (!players.length) return { groups: [], assignments: [], locked: !!locked };
  if (!previous || !locked) {
    const groups =
      players.length === 1
        ? [players]
        : pairRound(players, state.rounds).groups;
    return {
      groups,
      assignments: assignTables(
        groups,
        tables,
        state.floorPolicy || "balanced",
      ),
      locked: !!locked,
    };
  }
  const current = new Map(players.map((p) => [p.id, p]));
  const seated = new Set<string>();
  const seating: Seating = { groups: [], assignments: [], locked: true };
  for (const [index, group] of previous.groups.entries()) {
    const remaining = group
      .filter((p) => current.has(p.id) && !seated.has(p.id))
      .map((p) => current.get(p.id)!);
    if (!remaining.length) continue;
    remaining.forEach((p) => seated.add(p.id));
    const assignment = previous.assignments.find((a) => a.groupIndex === index);
    seating.groups.push(remaining);
    seating.assignments.push(
      assignment
        ? { ...assignment, groupIndex: seating.groups.length - 1 }
        : newAssignment(seating, tables, state, seating.groups.length - 1),
    );
  }
  for (const person of players.filter((p) => !seated.has(p.id))) {
    const options = seating.groups
      .map((group, index) => ({ group, index }))
      .filter(({ group }) => group.length < 4);
    const cost = (group: Person[]) => {
      const languages = new Set(group.flatMap((p) => p.speaks));
      const coverage = ["vi", "en"].filter(
        (language) =>
          !languages.has(language) && person.speaks.includes(language),
      ).length;
      const shared = group.filter(
        (p) =>
          (p.learningLanguages || [p.learns]).some(
            (language) => language && person.speaks.includes(language),
          ) ||
          (person.learningLanguages || [person.learns]).some(
            (language) => language && p.speaks.includes(language),
          ),
      ).length;
      return group.length * 10 - coverage * 100 - shared;
    };
    const target = options.sort(
      (a, b) => cost(a.group) - cost(b.group) || a.index - b.index,
    )[0];
    if (target) target.group.push(person);
    else {
      seating.groups.push([person]);
      seating.assignments.push(
        newAssignment(seating, tables, state, seating.groups.length - 1),
      );
    }
  }
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
