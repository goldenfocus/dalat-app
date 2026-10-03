import { personTargetSchema } from "@/lib/people/schema";
import { peopleJson, peopleSession, readPeopleBody } from "@/lib/people/http";

export async function POST(request: Request) {
  const session = await peopleSession(request);
  if (session.response) return session.response;
  const parsed = personTargetSchema.safeParse(await readPeopleBody(request));
  if (!parsed.success || parsed.data.user_id === session.user.id) return peopleJson({ code: "invalid_person" }, 400);
  const { error } = await session.db.from("people_blocks").insert({
    blocker_id: session.user.id, blocked_id: parsed.data.user_id,
  });
  if (error && error.code !== "23505") return peopleJson({ code: "block_failed" }, 503);
  return peopleJson({ success: true });
}

export async function DELETE(request: Request) {
  const session = await peopleSession(request);
  if (session.response) return session.response;
  const parsed = personTargetSchema.safeParse(await readPeopleBody(request));
  if (!parsed.success) return peopleJson({ code: "invalid_person" }, 400);
  const { error } = await session.db.from("people_blocks").delete()
    .eq("blocker_id", session.user.id).eq("blocked_id", parsed.data.user_id);
  if (error) return peopleJson({ code: "unblock_failed" }, 503);
  return peopleJson({ success: true });
}
