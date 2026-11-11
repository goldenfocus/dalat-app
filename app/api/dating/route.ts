import { z } from "zod";
import { datingFailure, datingJson, datingSession } from "@/lib/dating/http";
import { readPeopleBody } from "@/lib/people/http";
const gender = z.enum(["woman", "man", "nonbinary"]);
const schema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("profile"),
      birth_year: z.number().int(),
      birth_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      gender,
      seeking: z.array(gender).min(1).max(3),
      min_age: z.number().int().min(18).max(100),
      max_age: z.number().int().min(18).max(100),
      interests: z.array(z.enum(["coffee", "walks", "music"])).max(3),
    })
    .strict(),
  z.object({ operation: z.literal("pause") }).strict(),
  z
    .object({
      operation: z.literal("audience"),
      audience: z.enum(["only_me", "matches", "members"]),
    })
    .strict(),
  z
    .object({
      operation: z.literal("action"),
      target: z.uuid(),
      action: z.enum(["like", "pass", "block"]),
      hide_activity: z.boolean(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("message"),
      target: z.uuid(),
      body: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      operation: z.literal("report"),
      target: z.uuid(),
      reason: z.enum([
        "harassment",
        "spam",
        "impersonation",
        "underage",
        "other",
      ]),
      details: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      operation: z.literal("moderate"),
      report: z.uuid(),
      suspend: z.boolean(),
    })
    .strict(),
]);
export async function GET(request: Request) {
  const session = await datingSession(request);
  if (session.response) return session.response;
  const url = new URL(request.url),
    target = url.searchParams.get("target");
  if (target && !z.uuid().safeParse(target).success)
    return datingJson({ code: "invalid_request" }, 400);
  if (url.searchParams.get("admin") === "1") {
    const report = url.searchParams.get("report");
    if (report && !z.uuid().safeParse(report).success)
      return datingJson({ code: "invalid_request" }, 400);
    if (report) {
      const { data, error } = await session.db.rpc("dating_admin_evidence", {
        p_report: report,
      });
      return error ? datingFailure(error) : datingJson({ messages: data });
    }
    const { data, error } = await session.db.rpc("dating_admin_reports");
    return error ? datingFailure(error) : datingJson({ reports: data });
  }
  if (target) {
    const before = url.searchParams.get("before");
    if (before && !z.iso.datetime({ offset: true }).safeParse(before).success)
      return datingJson({ code: "invalid_request" }, 400);
    const { data, error } = await session.db.rpc("dating_messages_get", {
      p_target: target,
      p_before: before,
    });
    return error ? datingFailure(error) : datingJson({ messages: data });
  }
  const after = url.searchParams.get("after"),
    kind = url.searchParams.get("kind") ?? "discover";
  if (
    (after && !z.uuid().safeParse(after).success) ||
    !["discover", "likes", "matches"].includes(kind)
  )
    return datingJson({ code: "invalid_request" }, 400);
  const { data, error } = await session.db.rpc("dating_state", {
    p_after: after,
    p_kind: kind,
  });
  return error ? datingFailure(error) : datingJson(data);
}
export async function POST(request: Request) {
  const session = await datingSession(request);
  if (session.response) return session.response;
  const parsed = schema.safeParse(await readPeopleBody(request));
  if (!parsed.success) return datingJson({ code: "invalid_request" }, 400);
  const b = parsed.data;
  let name: string;
  let args: Record<string, unknown> = {};
  switch (b.operation) {
    case "profile":
      name = "dating_save_profile";
      args = {
        p_birth_year: b.birth_year,
        p_birth_date: b.birth_date,
        p_gender: b.gender,
        p_seeking: [...new Set(b.seeking)],
        p_min_age: b.min_age,
        p_max_age: b.max_age,
        p_interests: [...new Set(b.interests)],
      };
      break;
    case "pause":
      name = "dating_pause";
      break;
    case "audience":
      name = "dating_set_activity_audience";
      args = { p_audience: b.audience };
      break;
    case "action":
      name = "dating_act";
      args = {
        p_target: b.target,
        p_action: b.action,
        p_hide_activity: b.hide_activity,
      };
      break;
    case "message":
      name = "dating_send_message";
      args = { p_target: b.target, p_body: b.body };
      break;
    case "report":
      name = "dating_report";
      args = { p_target: b.target, p_reason: b.reason, p_details: b.details };
      break;
    case "moderate":
      name = "dating_moderate";
      args = { p_report: b.report, p_suspend: b.suspend };
      break;
  }
  const { data, error } = await session.db.rpc(name, args);
  return error ? datingFailure(error) : datingJson({ ok: true, id: data });
}
