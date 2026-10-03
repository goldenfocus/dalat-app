import { peopleProfileSchema, peoplePauseSchema } from "@/lib/people/schema";
import { peopleJson, peopleSession, readPeopleBody } from "@/lib/people/http";

export async function POST(request: Request) {
  const session = await peopleSession(request);
  if (session.response) return session.response;
  const parsed = peopleProfileSchema.safeParse(await readPeopleBody(request));
  if (!parsed.success) return peopleJson({ code: "invalid_profile" }, 400);
  const { db, user } = session;
  const { data: identity, error: identityError } = await db.from("profiles")
    .select("is_private,is_ghost").eq("id", user.id).maybeSingle();
  if (identityError) return peopleJson({ code: "unavailable" }, 503);
  if (!identity || identity.is_ghost || (parsed.data.enabled && identity.is_private)) {
    return peopleJson({ code: "private_profile" }, 403);
  }
  const { data: previous, error: previousError } = await db.from("people_profiles")
    .select("help_offered,help_wanted,source_locale").eq("user_id", user.id).maybeSingle();
  if (previousError) return peopleJson({ code: "unavailable" }, 503);
  const textChanged = previous?.help_offered !== parsed.data.help_offered || previous?.help_wanted !== parsed.data.help_wanted;
  const { data: profile, error } = await db.from("people_profiles").upsert({
    ...parsed.data,
    user_id: user.id,
    // UI locale is not evidence of the language someone wrote in.
    source_locale: textChanged ? null : previous?.source_locale ?? null,
  }, { onConflict: "user_id" }).select().single();
  if (error) return peopleJson({ code: "save_failed" }, 503);
  return peopleJson({ profile });
}

export async function PATCH(request: Request) {
  const session = await peopleSession(request);
  if (session.response) return session.response;
  if (!peoplePauseSchema.safeParse(await readPeopleBody(request)).success) {
    return peopleJson({ code: "invalid_profile" }, 400);
  }
  const { data: profile, error } = await session.db.from("people_profiles")
    .update({ enabled: false }).eq("user_id", session.user.id).select().maybeSingle();
  if (error) return peopleJson({ code: "save_failed" }, 503);
  return peopleJson({ profile });
}
