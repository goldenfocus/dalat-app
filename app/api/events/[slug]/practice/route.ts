import { z } from "zod";
import { arrivalFailure, arrivalJson, arrivalMutationAllowed, readArrivalBody } from "@/lib/arrival/http";
import { readPractice, startPractice } from "@/lib/practice/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
const schema = z.object({ expectedRound: z.number().int().min(0), minutes: z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(25), z.literal(30)]) }).strict();
export async function GET(_request: Request, { params }: Context) {
  try { return arrivalJson(await readPractice((await params).slug)); }
  catch (error) { return arrivalFailure(error); }
}
export async function POST(request: Request, { params }: Context) {
  if (!arrivalMutationAllowed(request)) return arrivalJson({ code: "forbidden" }, 403);
  const body = schema.safeParse(await readArrivalBody(request));
  if (!body.success) return arrivalJson({ code: "invalid_request" }, 400);
  try { return arrivalJson(await startPractice((await params).slug, body.data.expectedRound, body.data.minutes)); }
  catch (error) { return arrivalFailure(error); }
}
