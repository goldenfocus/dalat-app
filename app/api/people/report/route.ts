import { peopleReportSchema } from "@/lib/people/schema";
import { peopleJson, peopleSession, readPeopleBody } from "@/lib/people/http";

export async function POST(request: Request) {
  const session = await peopleSession(request);
  if (session.response) return session.response;
  const parsed = peopleReportSchema.safeParse(await readPeopleBody(request));
  if (!parsed.success || parsed.data.user_id === session.user.id) return peopleJson({ code: "invalid_report" }, 400);
  const { data: limit, error: limitError } = await session.db.rpc("check_rate_limit", {
    p_action: "people_report", p_limit: 10, p_window_ms: 3600000,
  });
  if (limitError) return peopleJson({ code: "unavailable" }, 503);
  if (!limit?.allowed) return peopleJson({ code: "rate_limited" }, 429);
  const { error } = await session.db.from("people_reports").insert({
    reporter_id: session.user.id, reported_user_id: parsed.data.user_id,
    reason: parsed.data.reason, details: parsed.data.details,
  });
  if (error && error.code !== "23505") return peopleJson({ code: "report_failed" }, 503);
  return peopleJson({ success: true });
}
