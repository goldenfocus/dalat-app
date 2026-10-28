import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPublicMenu } from "@/lib/menu/queries";
import { translatedRecords } from "@/lib/translations/public-content";
import type { ArrivalAccess, ArrivalEvent, ArrivalOrder, ArrivalParticipant, ArrivalReceipt } from "./types";

const noAccess: ArrivalAccess = { canWelcome: false, canOrder: false, canManage: false };
export const participantColumns = "id,event_id,user_id,nickname,practice_language,english_level,vietnamese_level,checked_in_at,language_preferences";
export const orderColumns = "id,participant_id,user_id,status,total_vnd,sponsored_vnd,guest_due_vnd,sponsor_status,sponsor_item_id,sponsor_settled_at,is_reservation,note,paid_at,created_at,event_preorder_items(menu_item_id,name_snapshot,qty,unit_price_vnd)";

export function arrivalAdmin() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function staffGuestHash(requestId: string) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`arrival:${requestId}`).digest("hex");
}
export function guestCookieName(eventId: string) { return `dalat_arrival_${eventId.replaceAll("-", "")}`; }
export function newGuestToken() { return randomBytes(32).toString("hex"); }
export async function guestToken(eventId: string) {
  const value = (await cookies()).get(guestCookieName(eventId))?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export async function arrivalContext(slug: string, locale = "en") {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const { data: row, error } = await db.from("events")
    .select("id,slug,title,starts_at,ends_at,venue_id,tribe_id,tribe_visibility,arrival_enabled,venues(name,preorder_enabled)")
    .eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw new Error("unavailable");
  if (!row || !row.arrival_enabled || (row.tribe_id && row.tribe_visibility !== "public")) throw new Error("event_not_found");
  const admin = arrivalAdmin();
  let access = noAccess;
  if (user) {
    const result = await admin.rpc("arrival_access", { p_event_id: row.id, p_actor_id: user.id });
    if (result.error) throw result.error;
    access = result.data as ArrivalAccess;
  }
  const venue = row.venues as unknown as { name: string; preorder_enabled: boolean } | null;
  const translations = await translatedRecords("event", [row.id], locale);
  const event: ArrivalEvent = {
    id: row.id, slug: row.slug, title: translations.get(row.id)?.get("title") || row.title,
    startsAt: row.starts_at, venueName: venue?.name || "", orderingEnabled: !!venue?.preorder_enabled,
    isOpen: Date.now() >= new Date(row.starts_at).getTime() - 6 * 3600_000 &&
      Date.now() <= new Date(row.ends_at || new Date(new Date(row.starts_at).getTime() + 6 * 3600_000)).getTime() + 2 * 3600_000,
  };
  const { data: campaign, error: campaignError } = await admin.from("event_drink_sponsors")
    .select("sponsor_name,ends_at,event_sponsored_drinks(menu_item_id)").eq("event_id", row.id).maybeSingle();
  if (campaignError) throw campaignError;
  event.sponsorship = campaign && new Date(campaign.ends_at).getTime() >= Date.now()
    ? { sponsorName: campaign.sponsor_name, eligibleItemIds: campaign.event_sponsored_drinks.map((item: { menu_item_id: string }) => item.menu_item_id) } : null;
  const menu = row.venue_id ? await getPublicMenu(row.venue_id, locale) : [];
  return { db, admin, user, event, access, menu };
}

export function mapOrder(row: Record<string, unknown>): ArrivalOrder {
  const { event_preorder_items, is_reservation, ...rest } = row;
  return { ...rest, ready_for_preparation: !is_reservation || !!row.participant_id, items: event_preorder_items || [] } as ArrivalOrder;
}

export async function ownReceipt(eventId: string, userId: string | undefined, hash: string | null): Promise<ArrivalReceipt | null> {
  const admin = arrivalAdmin();
  let participant: ArrivalParticipant | null = null;
  if (userId) {
    const result = await admin.from("event_arrival_participants").select(participantColumns)
      .eq("event_id", eventId).eq("user_id", userId).maybeSingle();
    if (result.error) throw result.error;
    participant = result.data;
  }
  if (!participant && hash) {
    const result = await admin.from("event_arrival_participants").select(participantColumns)
      .eq("event_id", eventId).eq("token_hash", hash).maybeSingle();
    if (result.error) throw result.error;
    participant = result.data;
  }
  if (!participant) return null;
  let orderQuery = admin.from("event_preorders").select(orderColumns).eq("event_id", eventId);
  orderQuery = participant.user_id
    ? orderQuery.or(`participant_id.eq.${participant.id},user_id.eq.${participant.user_id}`)
    : orderQuery.eq("participant_id", participant.id);
  const { data, error } = await orderQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return { participant, order: data ? mapOrder(data) : null };
}
