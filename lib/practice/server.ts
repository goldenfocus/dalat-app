import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { arrivalContext, guestToken, ownReceipt, participantColumns, tokenHash } from "@/lib/arrival/server";
import type { ArrivalParticipant } from "@/lib/arrival/types";
import { arrivalPerson, assignTables, DEFAULT_ROUND_MINUTES, DEFAULT_TABLES, eligiblePeople, numberPeople, pairRound, pendingPlayers, practiceView, remainingSeconds, rosterFingerprint, swapDraftParticipants, updateClock, type FloorPolicy, type Participation, type Person, type PracticeState, type Table } from "./model";
import { claimCookieName, signClaim, verifyClaim } from "./claim";

export type PracticeMutation =
  | { action: "participation"; expectedRevision: number; status: Participation; participantId?: string }
  | { action: "presence"; expectedRevision: number; status: "present" | "absent"; participantId: string }
  | { action: "settings"; expectedRevision: number; tables: Table[]; floorPolicy: FloorPolicy }
  | { action: "draft"; expectedRevision: number; minutes?: number }
  | { action: "swap"; expectedRevision: number; draftId: string; participantId: string; withParticipantId: string }
  | { action: "start"; expectedRevision: number; draftId: string }
  | { action: "pause" | "resume" | "end"; expectedRevision: number }
  | { action: "extend"; expectedRevision: number; seconds: number };

export async function practiceContext(slug: string) {
  // Restrict the pilot to the existing language-exchange series.
  if (!/^language-exchange-social-house-z8oc-\d{8}$/.test(slug)) throw new Error("event_not_found");
  const context = await arrivalContext(slug);
  const { admin, event, user, access } = context;
  const [arrivals, legacy, stored, staff, metadata] = await Promise.all([
    admin.from("event_arrival_participants").select(participantColumns).eq("event_id", event.id).order("checked_in_at"),
    admin.from("rsvps").select("id,user_id,profiles(display_name,username)").eq("event_id", event.id).eq("status", "going").not("checked_in_at", "is", null),
    admin.from("event_practice_rooms").select("state,revision").eq("event_id", event.id).maybeSingle(),
    admin.from("event_staff").select("user_id").eq("event_id", event.id),
    admin.from("events").select("created_by,venue_id,venues(owner_id)").eq("id", event.id).single(),
  ]);
  for (const result of [arrivals, legacy, stored, staff, metadata]) if (result.error) throw result.error;
  const participants = (arrivals.data || []) as ArrivalParticipant[];
  const registered = new Set(participants.map(p => p.user_id).filter(Boolean));
  const people: Person[] = participants.map(arrivalPerson);
  const personUsers = new Map(participants.filter(p => p.user_id).map(p => [p.id, p.user_id!]));
  let ownId: string | null = user ? participants.find(p => p.user_id === user.id)?.id || null : null;
  for (const row of legacy.data || []) {
    if (registered.has(row.user_id)) continue;
    const profile = row.profiles as unknown as { display_name: string | null; username: string | null } | null;
    const id = `rsvp:${row.id}`;
    people.push({ id, name: profile?.display_name || profile?.username || "Guest", speaks: [], learns: null });
    personUsers.set(id, row.user_id);
    if (row.user_id === user?.id) ownId = id;
  }
  // Identify hosts from authority records, never from a person's name. This includes
  // the venue owner even if they have not been explicitly added to event_staff.
  const staffUsers = new Set<string>((staff.data || []).map(s => s.user_id));
  if (metadata.data?.created_by) staffUsers.add(metadata.data.created_by);
  const venue = metadata.data?.venues as unknown as { owner_id: string | null } | null;
  if (venue?.owner_id) staffUsers.add(venue.owner_id);
  const userIds = [...new Set(personUsers.values())];
  const [managers, knownProfiles] = await Promise.all([
    metadata.data?.venue_id
      ? admin.from("venue_managers").select("profile_id").eq("venue_id", metadata.data.venue_id).not("accepted_at", "is", null).in("role", ["owner", "editor"])
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? admin.from("profiles").select("id,role,avatar_url").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [managers, knownProfiles]) if (result.error) throw result.error;
  for (const row of managers.data || []) staffUsers.add(row.profile_id);
  const privilegedRoles = metadata.data?.venue_id ? ["admin", "superadmin", "moderator"] : ["admin", "superadmin"];
  for (const row of knownProfiles.data || []) {
    if (privilegedRoles.includes(row.role)) staffUsers.add(row.id);
    // Only the existing arrival/RSVP user_id relationship selects a profile image.
    // Guest names, emails and external account text never establish ownership.
    if (typeof row.avatar_url !== "string") continue;
    let avatarUrl: string;
    try {
      const url = new URL(row.avatar_url);
      if (!["https:", "http:"].includes(url.protocol)) continue;
      avatarUrl = url.href;
    } catch { continue; }
    for (const person of people) if (personUsers.get(person.id) === row.id) person.avatarUrl = avatarUrl;
  }
  const staffIds = new Set([...personUsers].filter(([, uid]) => staffUsers.has(uid)).map(([id]) => id));
  if (!ownId) {
    const token = await guestToken(event.id);
    if (token) ownId = (await ownReceipt(event.id, undefined, tokenHash(token)))?.participant.id || null;
  }
  if (!ownId) {
    const claim = (await cookies()).get(claimCookieName(event.id))?.value;
    if (claim) ownId = verifyClaim(claim, event.id, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  const state: PracticeState = stored.data?.state || { rounds: [] };
  const canStart = access.canManage || access.canWelcome;
  return { ...context, people, staffIds, ownId, state, revision: stored.data?.revision ?? -1, canStart };
}

function view(c: Awaited<ReturnType<typeof practiceContext>>) {
  return practiceView(c.state, c.people, c.ownId, c.canStart, c.revision, c.staffIds);
}

export async function recoverPractice(slug: string, code: string, ip: string) {
  const c = await practiceContext(slug);
  const limit = await c.admin.rpc("arrival_rate_limit", {
    p_key: tokenHash(`practice-receipt:${c.event.id}:${ip}`), p_limit: 200,
  });
  if (limit.error) throw limit.error;
  if (!limit.data) throw new Error("forbidden");
  const matches = c.people.filter(p => p.id.replace(/^rsvp:/, "").slice(0, 8).toUpperCase() === code.toUpperCase());
  if (matches.length !== 1) throw new Error("invalid_request");
  const person = matches[0];
  return {
    view: view({ ...c, ownId: person.id }),
    cookie: claimCookieName(c.event.id),
    token: signClaim(c.event.id, person.id, process.env.SUPABASE_SERVICE_ROLE_KEY!),
  };
}

export async function readPractice(slug: string) { return view(await practiceContext(slug)); }

async function persist(c: Awaited<ReturnType<typeof practiceContext>>, state: PracticeState) {
  if (c.revision < 0) {
    const result = await c.admin.from("event_practice_rooms").insert({ event_id: c.event.id, state });
    if (result.error?.code === "23505") throw new Error("status_conflict");
    if (result.error) throw result.error;
  } else {
    const result = await c.admin.from("event_practice_rooms").update({ state, revision: c.revision + 1, updated_at: new Date().toISOString() })
      .eq("event_id", c.event.id).eq("revision", c.revision).select("event_id");
    if (result.error) throw result.error;
    if (!result.data?.length) throw new Error("status_conflict");
  }
  return view({ ...c, state, revision: c.revision + 1 });
}

export async function mutatePractice(slug: string, mutation: PracticeMutation) {
  const c = await practiceContext(slug);
  if (mutation.expectedRevision !== c.revision) throw new Error("status_conflict");
  const numbered = numberPeople(c.state, c.people);
  let state: PracticeState = { ...c.state, numbers: { ...c.state.numbers, ...Object.fromEntries(numbered.map(p => [p.id, p.number!])) } };
  if (mutation.action === "participation") {
    const id = mutation.participantId || c.ownId;
    if (!id || !c.people.some(p => p.id === id)) throw new Error("participant_not_found");
    if (id !== c.ownId && (!c.user || !c.canStart)) throw new Error("forbidden");
    state = { ...state, participation: { ...state.participation, [id]: mutation.status }, draft: null };
    return persist(c, state);
  }
  if (!c.user || !c.canStart) throw new Error("forbidden");
  if (mutation.action === "presence") {
    if (!c.people.some(person => person.id === mutation.participantId)) throw new Error("participant_not_found");
    state = { ...state, presence: { ...state.presence, [mutation.participantId]: mutation.status }, draft: null };
  } else if (mutation.action === "settings") {
    state = { ...state, tables: mutation.tables, floorPolicy: mutation.floorPolicy, draft: null };
  } else if (mutation.action === "draft") {
    if (pendingPlayers(state, c.people, c.staffIds).length) throw new Error("invalid_presence_check");
    const players = eligiblePeople(state, c.people, c.staffIds);
    const tables = state.tables || DEFAULT_TABLES;
    const floorPolicy = state.floorPolicy || "balanced";
    const candidate = pairRound(players, state.rounds, mutation.minutes ?? DEFAULT_ROUND_MINUTES);
    state = { ...state, draft: {
      id: randomUUID(), round: candidate.number, minutes: candidate.minutes, groups: candidate.groups,
      assignments: assignTables(candidate.groups, tables, floorPolicy),
      rosterFingerprint: rosterFingerprint(players, tables, floorPolicy), createdAt: new Date().toISOString(),
    } };
  } else if (mutation.action === "swap") {
    const draft = state.draft;
    if (!draft || draft.id !== mutation.draftId || draft.round !== state.rounds.length + 1) throw new Error("status_conflict");
    const players = eligiblePeople(state, c.people, c.staffIds);
    if (draft.rosterFingerprint !== rosterFingerprint(players, state.tables || DEFAULT_TABLES, state.floorPolicy || "balanced")) throw new Error("status_conflict");
    state = { ...state, draft: swapDraftParticipants(draft, mutation.participantId, mutation.withParticipantId, randomUUID(), state.tables || DEFAULT_TABLES) };
  } else {
    if (!c.event.isOpen) throw new Error("event_not_open_for_arrival");
    if (mutation.action === "start") {
      const draft = state.draft;
      if (!draft || draft.id !== mutation.draftId || draft.round !== state.rounds.length + 1) throw new Error("status_conflict");
      // Start the exact reviewed groups. New arrivals wait for the next draft;
      // they must not prevent the host from starting everyone already paired.
      const draftedIds = new Set(draft.groups.flat().map(person => person.id));
      const players = eligiblePeople(state, c.people, c.staffIds).filter(person => draftedIds.has(person.id));
      if (draft.rosterFingerprint !== rosterFingerprint(players, state.tables || DEFAULT_TABLES, state.floorPolicy || "balanced")) throw new Error("status_conflict");
      const current = state.rounds.at(-1);
      if (current && !current.endedAt && (current.pausedAt || remainingSeconds(current) > 0)) throw new Error("status_conflict");
      const now = new Date();
      state = { ...state, rounds: [...state.rounds, {
        number: draft.round, minutes: draft.minutes, groups: draft.groups, assignments: draft.assignments,
        startedAt: now.toISOString(), endsAt: new Date(now.getTime() + draft.minutes * 60_000).toISOString(),
      }], draft: null };
    } else {
      const current = state.rounds.at(-1);
      if (!current) throw new Error("status_conflict");
      const round = updateClock(current, mutation.action, new Date(), mutation.action === "extend" ? mutation.seconds : undefined);
      state = { ...state, rounds: [...state.rounds.slice(0, -1), round] };
    }
  }
  return persist(c, state);
}
