import { z } from "zod";
import { arrivalFailure, arrivalJson, arrivalMutationAllowed, readArrivalBody } from "@/lib/arrival/http";
import { DEFAULT_ROUND_MINUTES } from "@/lib/practice/model";
import { mutatePractice, readPractice, recoverPractice } from "@/lib/practice/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
const revision = z.number().int().min(-1);
const tableSchema = z.object({ number: z.number().int().min(1).max(99), floor: z.enum(["downstairs", "upstairs"]), capacity: z.number().int().min(1).max(12), available: z.boolean(), bar: z.boolean().optional() }).strict();
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("participation"), expectedRevision: revision, status: z.enum(["playing", "visiting", "break", "left", "hosting"]), participantId: z.string().min(1).max(100).optional() }).strict(),
  z.object({ action: z.literal("settings"), expectedRevision: revision, tables: z.array(tableSchema).min(1).max(30).refine(tables => new Set(tables.map(t => t.number)).size === tables.length), floorPolicy: z.enum(["balanced", "downstairs", "upstairs"]) }).strict(),
  z.object({ action: z.literal("draft"), expectedRevision: revision, minutes: z.number().int().min(5).max(30).default(DEFAULT_ROUND_MINUTES) }).strict(),
  z.object({ action: z.literal("swap"), expectedRevision: revision, draftId: z.string().uuid(), participantId: z.string().min(1).max(100), withParticipantId: z.string().min(1).max(100) }).strict(),
  z.object({ action: z.literal("start"), expectedRevision: revision, draftId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("pause"), expectedRevision: revision }).strict(),
  z.object({ action: z.literal("resume"), expectedRevision: revision }).strict(),
  z.object({ action: z.literal("end"), expectedRevision: revision }).strict(),
  z.object({ action: z.literal("extend"), expectedRevision: revision, seconds: z.number().int().min(30).max(600) }).strict(),
]);
const recoverySchema = z.object({ action: z.literal("find"), code: z.string().trim().regex(/^[a-f0-9]{8}$/i) }).strict();
export async function GET(_request: Request, { params }: Context) {
  try { return arrivalJson(await readPractice((await params).slug)); }
  catch (error) { return arrivalFailure(error); }
}
export async function POST(request: Request, { params }: Context) {
  if (!arrivalMutationAllowed(request)) return arrivalJson({ code: "forbidden" }, 403);
  const raw = await readArrivalBody(request);
  const recovery = recoverySchema.safeParse(raw);
  if (recovery.success) {
    try {
      const { slug } = await params;
      const ip = (process.env.VERCEL ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null) || "unknown";
      const result = await recoverPractice(slug, recovery.data.code, ip);
      const response = arrivalJson(result.view);
      response.cookies.set(result.cookie, result.token, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: `/api/events/${slug}/practice`, maxAge: 6 * 3600 });
      return response;
    } catch (error) { return arrivalFailure(error); }
  }
  const body = schema.safeParse(raw);
  if (!body.success) return arrivalJson({ code: "invalid_request" }, 400);
  try { return arrivalJson(await mutatePractice((await params).slug, body.data)); }
  catch (error) { return arrivalFailure(error); }
}
