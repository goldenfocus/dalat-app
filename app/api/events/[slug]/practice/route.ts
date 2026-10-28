import { z } from "zod";
import { arrivalFailure, arrivalJson, arrivalMutationAllowed, readArrivalBody } from "@/lib/arrival/http";
import { readPractice, recoverPractice, startPractice } from "@/lib/practice/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
const schema = z.object({ expectedRound: z.number().int().min(0), minutes: z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(25), z.literal(30)]) }).strict();
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
  try { return arrivalJson(await startPractice((await params).slug, body.data.expectedRound, body.data.minutes)); }
  catch (error) { return arrivalFailure(error); }
}
