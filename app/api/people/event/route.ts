import { peopleEventSchema } from "@/lib/people/schema";
import { peopleJson, peopleSession, readPeopleBody } from "@/lib/people/http";

export async function POST(request: Request) {
  const session = await peopleSession(request);
  if (session.response) return session.response;
  const parsed = peopleEventSchema.safeParse(await readPeopleBody(request));
  if (!parsed.success) return peopleJson({ code: "invalid_event" }, 400);
  // RLS verifies current RSVP, event access and People consent for direct API calls too.
  const { error } = await session.db.from("event_people").insert({
    user_id: session.user.id, event_id: parsed.data.event_id,
  });
  if (error && error.code !== "23505") return peopleJson({ code: "event_share_failed" }, 403);
  return peopleJson({ success: true });
}

export async function DELETE(request: Request) {
  const session = await peopleSession(request);
  if (session.response) return session.response;
  const parsed = peopleEventSchema.safeParse(await readPeopleBody(request));
  if (!parsed.success) return peopleJson({ code: "invalid_event" }, 400);
  const { error } = await session.db.from("event_people").delete()
    .eq("user_id", session.user.id).eq("event_id", parsed.data.event_id);
  if (error) return peopleJson({ code: "event_share_failed" }, 503);
  return peopleJson({ success: true });
}
