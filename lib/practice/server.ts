import "server-only";
import { arrivalContext, guestToken, ownReceipt, participantColumns, tokenHash } from "@/lib/arrival/server";
import type { ArrivalParticipant } from "@/lib/arrival/types";
import { arrivalPerson, pairRound, practiceView, type Person, type PracticeState } from "./model";

export async function practiceContext(slug: string) {
  // Restrict the pilot to the existing language-exchange series.
  if (!/^language-exchange-social-house-z8oc-\d{8}$/.test(slug)) throw new Error("event_not_found");
  const context = await arrivalContext(slug);
  const { admin, event, user, access } = context;
  const [arrivals, legacy, stored] = await Promise.all([
    admin.from("event_arrival_participants").select(participantColumns).eq("event_id", event.id).order("checked_in_at"),
    admin.from("rsvps").select("id,user_id,profiles(display_name,username)").eq("event_id", event.id).eq("status", "going").not("checked_in_at", "is", null),
    admin.from("event_practice_rooms").select("state,revision").eq("event_id", event.id).maybeSingle(),
  ]);
  for (const result of [arrivals, legacy, stored]) if (result.error) throw result.error;
  const participants = (arrivals.data || []) as ArrivalParticipant[];
  const registered = new Set(participants.map(p => p.user_id).filter(Boolean));
  const people: Person[] = participants.map(arrivalPerson);
  let ownId: string | null = user ? participants.find(p => p.user_id === user.id)?.id || null : null;
  for (const row of legacy.data || []) {
    if (registered.has(row.user_id)) continue;
    const profile = row.profiles as unknown as { display_name: string | null; username: string | null } | null;
    const id = `rsvp:${row.id}`;
    people.push({ id, name: profile?.display_name || profile?.username || "Guest", speaks: [], learns: null });
    if (row.user_id === user?.id) ownId = id;
  }
  if (!ownId) {
    const token = await guestToken(event.id);
    if (token) ownId = (await ownReceipt(event.id, undefined, tokenHash(token)))?.participant.id || null;
  }
  const state: PracticeState = stored.data?.state || { rounds: [] };
  // Welcome/co-host staff already have authority over the checked-in roster.
  const canStart = access.canManage || access.canWelcome;
  return { ...context, people, ownId, state, revision: stored.data?.revision ?? -1, canStart };
}

export async function readPractice(slug: string) {
  const c = await practiceContext(slug);
  return practiceView(c.state, c.people, c.ownId, c.canStart);
}

export async function startPractice(slug: string, expectedRound: number, minutes: number) {
  const c = await practiceContext(slug);
  if (!c.user || !c.canStart) throw new Error("forbidden");
  if (!c.event.isOpen) throw new Error("event_not_open_for_arrival");
  if (expectedRound !== c.state.rounds.length) throw new Error("status_conflict");
  const round = pairRound(c.people, c.state.rounds, minutes);
  const state = { rounds: [...c.state.rounds, round] };
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
  return practiceView(state, c.people, c.ownId, c.canStart);
}
