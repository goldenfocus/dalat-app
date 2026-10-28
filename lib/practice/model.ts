import type { ArrivalParticipant } from "@/lib/arrival/types";

export type Person = { id: string; name: string; speaks: string[]; learns: string | null };
export type Round = { number: number; startedAt: string; minutes: number; groups: Person[][] };
export type PracticeState = { rounds: Round[] };
export type PracticeView = { canStart: boolean; count: number; round: Round | null; me: Person | null; groups: Person[][]; myGroup?: Person[]; myGroupNumber?: number | null };

export function arrivalPerson(p: ArrivalParticipant): Person {
  const prefs = p.language_preferences;
  return {
    id: p.id, name: p.nickname,
    speaks: prefs ? prefs.speaks.filter(s => ["native", "fluent", "intermediate"].includes(s.level)).map(s => s.language) : [],
    learns: prefs?.learning.language || (p.practice_language === "english" ? "en" : p.practice_language === "vietnamese" ? "vi" : null),
  };
}

/** Checked-in identities are unique. Unknown language ability stays unknown. */
export function pairRound(people: Person[], previous: Round[], minutes: number, now = new Date()): Round {
  const roster = [...new Map(people.map(p => [p.id, p])).values()];
  if (roster.length < 2 || roster.length > 150) throw new Error("invalid_roster");
  const met = new Set<string>();
  const key = (a: string, b: string) => [a, b].sort().join(":");
  for (const round of previous) for (const group of round.groups)
    for (const a of group) for (const b of group) if (a.id !== b.id) met.add(key(a.id, b.id));
  const score = (a: Person, b: Person) =>
    (a.learns && b.speaks.includes(a.learns) ? 1000 : 0) +
    (b.learns && a.speaks.includes(b.learns) ? 1000 : 0) +
    (a.learns && b.learns && a.learns !== b.learns ? 100 : 0) -
    (met.has(key(a.id, b.id)) ? 300 : 0);
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
  return { number: previous.length + 1, startedAt: now.toISOString(), minutes, groups: best };
}

/** Guests only receive their own group; the complete roster is staff-only. */
export function practiceView(state: PracticeState, people: Person[], ownId: string | null, canStart: boolean): PracticeView {
  const current = state.rounds.at(-1) || null;
  const groups = current?.groups || [];
  const myGroupIndex = groups.findIndex(g => g.some(p => p.id === ownId));
  return {
    canStart, count: people.length, me: people.find(p => p.id === ownId) || null,
    round: current ? { ...current, groups: [] } : null,
    groups: canStart ? groups : groups.filter(g => g.some(p => p.id === ownId)),
    myGroup: myGroupIndex < 0 ? [] : groups[myGroupIndex],
    myGroupNumber: myGroupIndex < 0 ? null : myGroupIndex + 1,
  };
}
