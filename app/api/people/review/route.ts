import { peopleReviewSchema } from "@/lib/people/schema";
import { peopleJson, peopleSession, readPeopleBody } from "@/lib/people/http";

export async function PATCH(request: Request) {
  const session = await peopleSession(request);
  if (session.response) return session.response;
  const parsed = peopleReviewSchema.safeParse(await readPeopleBody(request));
  if (!parsed.success) return peopleJson({ code: "invalid_review" }, 400);
  const { data: staff, error: roleError } = await session.db.rpc("people_is_staff");
  if (roleError || !staff) return peopleJson({ code: "forbidden" }, 403);
  const { data, error } = await session.db.from("people_reports").update({ status: "reviewed" })
    .eq("id", parsed.data.id).select("id").maybeSingle();
  if (error) return peopleJson({ code: "review_failed" }, 503);
  if (!data) return peopleJson({ code: "not_found" }, 404);
  return peopleJson({ success: true });
}
