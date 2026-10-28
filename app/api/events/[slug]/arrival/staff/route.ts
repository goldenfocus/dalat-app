import type { NextRequest } from "next/server";
import { arrivalContext, mapOrder, orderColumns, participantColumns } from "@/lib/arrival/server";
import { arrivalFailure, arrivalJson, arrivalMutationAllowed, readArrivalBody } from "@/lib/arrival/http";
import { staffActionSchema } from "@/lib/arrival/schema";
import { languagePreferencesSchema as legacyLanguagePreferencesSchema } from "@/lib/arrival/legacy-languages";
import type { LanguagePreferences } from "@/lib/arrival/languages";
import type { ArrivalParticipant } from "@/lib/arrival/types";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ slug: string }> };
type Profile = { display_name: string | null; username: string | null };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { slug } = await params;
    const { admin, user, event, access, menu } = await arrivalContext(slug, request.nextUrl.searchParams.get("locale") || "en");
    if (!user) return arrivalJson({ code: "not_authenticated" }, 401);
    if (!access.canWelcome && !access.canOrder) return arrivalJson({ code: "forbidden" }, 403);
    const [participantsResult, ordersResult, rsvpsResult, staffResult] = await Promise.all([
      admin.from("event_arrival_participants").select(participantColumns).eq("event_id", event.id).order("checked_in_at"),
      admin.from("event_preorders").select(orderColumns).eq("event_id", event.id).order("created_at", { ascending: false }),
      access.canWelcome ? admin.from("rsvps").select("id,user_id,checked_in_at,profiles(display_name,username)").eq("event_id", event.id).eq("status", "going") : Promise.resolve({ data: [], error: null }),
      access.canManage ? admin.from("event_staff").select("user_id,role,profiles(display_name,username)").eq("event_id", event.id) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [participantsResult, ordersResult, rsvpsResult, staffResult]) if (result.error) throw result.error;
    const participants = (participantsResult.data || []) as ArrivalParticipant[];
    const names = new Map(participants.map((p) => [p.id, p.nickname]));
    const userNames = new Map(participants.filter((p) => p.user_id).map((p) => [p.user_id, p.nickname]));
    const expectedUserIds = (rsvpsResult.data || []).map(row => row.user_id);
    const saved = expectedUserIds.length ? await admin.from("language_exchange_preferences").select("user_id,practice_language,english_level,vietnamese_level").in("user_id", expectedUserIds) : { data: [], error: null };
    if (saved.error) throw saved.error;
    const preferencesByUser = new Map((saved.data || []).map(row => {
      const parsed = legacyLanguagePreferencesSchema.safeParse({ practiceLanguage: row.practice_language, englishLevel: row.english_level, vietnameseLevel: row.vietnamese_level });
      return [row.user_id, parsed.success ? parsed.data : null];
    }));
    const rsvpUserIds = (rsvpsResult.data || []).map(row => row.user_id);
    const savedLanguages = access.canWelcome && rsvpUserIds.length
      ? await admin.from("event_language_profiles").select("user_id,preferences").in("user_id", rsvpUserIds)
      : { data: [], error: null };
    if (savedLanguages.error) throw savedLanguages.error;
    const languageByUser = new Map((savedLanguages.data || []).map(row => [row.user_id, row.preferences as LanguagePreferences]));

    const rsvps = (rsvpsResult.data || []).map((row) => {
      const profile = row.profiles as unknown as Profile | null;
      const name = profile?.display_name || profile?.username || "";
      userNames.set(row.user_id, name);
      return { preferences: preferencesByUser.get(row.user_id) || null, languagePreferences: languageByUser.get(row.user_id) || null, id: row.id, user_id: row.user_id, checked_in_at: row.checked_in_at, displayName: name, username: profile?.username || null };
    });
    // Include names for preorders placed before check-in, even on order-only screens.
    const missingUsers = [...new Set((ordersResult.data || []).map((row) => row.user_id).filter((id): id is string => !!id && !userNames.has(id)))];
    if (missingUsers.length) {
      const profiles = await admin.from("profiles").select("id,display_name,username").in("id", missingUsers);
      if (profiles.error) throw profiles.error;
      for (const profile of profiles.data || []) userNames.set(profile.id, profile.display_name || profile.username || "");
    }
    const orders = (ordersResult.data || []).map((row) => ({
      ...mapOrder(row), guestName: names.get(row.participant_id) || userNames.get(row.user_id) || "",
    }));
    const staff = (staffResult.data || []).map((row) => {
      const profile = row.profiles as unknown as Profile | null;
      return { user_id: row.user_id, role: row.role, displayName: profile?.display_name || profile?.username || "", username: profile?.username || null };
    });
    const sponsorAccounting = access.canManage ? orders.reduce((totals, order) => {
      const amount = order.sponsored_vnd || 0;
      if (order.sponsor_status === "reserved") totals.reserved_vnd += amount;
      if (order.sponsor_status === "owed") totals.owed_vnd += amount;
      if (order.sponsor_status === "settled") totals.settled_vnd += amount;
      return totals;
    }, { reserved_vnd: 0, owed_vnd: 0, settled_vnd: 0 }) : null;
    return arrivalJson({ event, access, menu, sponsorAccounting, participants: access.canWelcome ? participants : [], orders: access.canOrder ? orders : [], rsvps, staff });
  } catch (error) { return arrivalFailure(error); }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!arrivalMutationAllowed(request)) return arrivalJson({ code: "forbidden" }, 403);
  const parsed = staffActionSchema.safeParse(await readArrivalBody(request));
  if (!parsed.success) return arrivalJson({ code: "invalid_request" }, 400);
  try {
    const { slug } = await params;
    const { admin, user, event } = await arrivalContext(slug);
    if (!user) return arrivalJson({ code: "not_authenticated" }, 401);
    const { data, error } = await admin.rpc("arrival_staff_action", {
      p_event_id: event.id, p_actor_id: user.id, p_payload: parsed.data,
    });
    if (error) throw error;
    return arrivalJson(data || { success: true });
  } catch (error) { return arrivalFailure(error); }
}
