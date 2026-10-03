import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isPeopleEnabled, PEOPLE_INTENTIONS, PEOPLE_LANGUAGES, PEOPLE_PAGE_SIZE } from "./constants";
import type { PeopleBlock, PeopleCard, PeopleFilters, PeopleIdentity, PeopleProfile } from "./types";
import { z } from "zod";

const uuid = z.uuid();

// React cache is request-scoped. No shared ISR cache may hold People data.
export const getPeopleViewer = cache(async () => {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { user: null, profile: null };
  const { data: profile, error } = await db.from("profiles")
    .select("id,is_private,is_ghost").eq("id", user.id).maybeSingle();
  if (error) throw new Error("people_viewer_unavailable");
  return { user: { id: user.id }, profile: profile as { id: string; is_private: boolean; is_ghost: boolean } | null };
});

export async function getOwnPeopleProfile(): Promise<PeopleProfile | null> {
  if (!isPeopleEnabled()) return null;
  const { user } = await getPeopleViewer();
  if (!user) return null;
  const db = await createClient();
  const { data, error } = await db.from("people_profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("people_profile_unavailable");
  return data as PeopleProfile | null;
}

async function hydratePeople(db: SupabaseClient, rows: PeopleProfile[], locale: string): Promise<PeopleCard[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.user_id);
  const [{ data: identities, error: identityError }, { data: translations, error: translationError }] = await Promise.all([
    db.from("profiles").select("id,display_name,username,avatar_url,bio")
      .in("id", ids).eq("is_private", false).or("is_ghost.eq.false,is_ghost.is.null"),
    db.from("content_translations").select("content_id,content_type,field_name,target_locale,translated_text,source_updated_at")
      .in("content_id", ids).in("content_type", ["people", "profile"])
      .in("target_locale", [...new Set([locale, "en"])])
      .in("field_name", ["help_offered", "help_wanted", "bio"]),
  ]);
  if (identityError || translationError) throw new Error("people_discovery_unavailable");
  const identityMap = new Map((identities as PeopleIdentity[] ?? []).map((profile) => [profile.id, profile]));
  return rows.flatMap((row) => {
    const profile = identityMap.get(row.user_id);
    if (!profile || !row.enabled) return [];
    const translated = (field: "help_offered" | "help_wanted" | "bio", fallback: string | null) => {
      if (!fallback?.trim()) return fallback;
      const eligible = (translations ?? []).filter((translation) =>
        translation.content_id === row.user_id && translation.field_name === field &&
        (field === "bio" ? translation.content_type === "profile" :
          translation.content_type === "people" && translation.source_updated_at === row.content_updated_at)
      );
      return eligible.find((translation) => translation.target_locale === locale)?.translated_text ??
        eligible.find((translation) => translation.target_locale === "en")?.translated_text ?? fallback;
    };
    return [{ ...row, profile: { ...profile, bio: translated("bio", profile.bio) },
      help_offered: translated("help_offered", row.help_offered) ?? "",
      help_wanted: translated("help_wanted", row.help_wanted) ?? "" }];
  });
}

export async function getPeoplePage(filters: PeopleFilters, locale: string): Promise<{ people: PeopleCard[]; hasMore: boolean }> {
  if (!isPeopleEnabled()) return { people: [], hasMore: false };
  const { user } = await getPeopleViewer();
  if (!user) return { people: [], hasMore: false };
  if (filters.eventId && !uuid.safeParse(filters.eventId).success) return { people: [], hasMore: false };
  const db = await createClient();
  const page = Number.isFinite(filters.page) ? Math.max(1, Math.min(417, Math.trunc(filters.page!))) : 1;
  const { data, error } = await db.rpc("discover_people", {
    p_search: (filters.q ?? "").trim().slice(0, 100),
    p_intention: PEOPLE_INTENTIONS.includes(filters.intention as typeof PEOPLE_INTENTIONS[number]) ? filters.intention : null,
    p_language: PEOPLE_LANGUAGES.includes(filters.language as typeof PEOPLE_LANGUAGES[number]) ? filters.language : null,
    p_offset: (page - 1) * PEOPLE_PAGE_SIZE,
    p_limit: PEOPLE_PAGE_SIZE + 1,
    p_event_id: filters.eventId ?? null,
  });
  if (error) throw new Error("people_discovery_unavailable");
  const rows = (data ?? []) as PeopleProfile[];
  return { people: await hydratePeople(db, rows.slice(0, PEOPLE_PAGE_SIZE), locale), hasMore: rows.length > PEOPLE_PAGE_SIZE };
}

export async function getPeopleProfile(userId: string, locale: string): Promise<PeopleCard | null> {
  if (!uuid.safeParse(userId).success) return null;
  if (!isPeopleEnabled() || !(await getPeopleViewer()).user) return null;
  const db = await createClient();
  const { data, error } = await db.from("people_profiles").select("*")
    .eq("user_id", userId).eq("enabled", true).maybeSingle();
  if (error) throw new Error("people_profile_unavailable");
  if (!data) return null;
  return (await hydratePeople(db, [data as PeopleProfile], locale))[0] ?? null;
}

export async function getPeopleBlocks(): Promise<PeopleBlock[]> {
  const { user } = await getPeopleViewer();
  if (!isPeopleEnabled() || !user) return [];
  const db = await createClient();
  const { data, error } = await db.from("people_blocks").select("blocked_id")
    .eq("blocker_id", user.id).order("created_at", { ascending: false });
  if (error) throw new Error("people_blocks_unavailable");
  if (!data?.length) return [];
  const { data: profiles, error: profileError } = await db.from("profiles")
    .select("id,display_name,username,avatar_url").in("id", data.map((row) => row.blocked_id));
  if (profileError) throw new Error("people_blocks_unavailable");
  return data.flatMap((row) => {
    const profile = profiles?.find((item) => item.id === row.blocked_id);
    return profile ? [{ blocked_id: row.blocked_id, profile }] : [];
  });
}

export async function getEventPeople(eventId: string, locale: string) {
  const empty = { people: [] as PeopleCard[], joined: false, canJoin: false };
  if (!uuid.safeParse(eventId).success) return empty;
  const { user, profile } = await getPeopleViewer();
  if (!isPeopleEnabled() || !user) return empty;
  const db = await createClient();
  const [{ data: event, error: eventError }, { data: own, error: ownError }, { data: rsvp, error: rsvpError }, { data: participants, error: peopleError }] = await Promise.all([
    db.from("events").select("id").eq("id", eventId).maybeSingle(),
    db.from("people_profiles").select("enabled").eq("user_id", user.id).maybeSingle(),
    db.from("rsvps").select("status").eq("event_id", eventId).eq("user_id", user.id).maybeSingle(),
    db.from("event_people").select("user_id").eq("event_id", eventId).order("created_at").limit(24),
  ]);
  if (eventError || ownError || rsvpError || peopleError) throw new Error("event_people_unavailable");
  if (!event) return empty;
  const canJoin = own?.enabled === true && profile?.is_private === false && !profile?.is_ghost && rsvp?.status === "going";
  // Own consent may not be in the first page of participants.
  const { data: membership, error: membershipError } = await db.from("event_people").select("user_id")
    .eq("event_id", eventId).eq("user_id", user.id).maybeSingle();
  if (membershipError) throw new Error("event_people_unavailable");
  let people: PeopleCard[] = [];
  if (participants?.length) {
    const { data: rows, error } = await db.from("people_profiles").select("*").in("user_id", participants.map((row) => row.user_id));
    if (error) throw new Error("event_people_unavailable");
    people = await hydratePeople(db, (rows ?? []) as PeopleProfile[], locale);
  }
  return { people, joined: !!membership, canJoin };
}
