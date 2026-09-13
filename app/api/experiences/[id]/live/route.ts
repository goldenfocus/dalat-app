import { interviewInstructions } from "@/lib/experiences/interview";
import { createHash } from "node:crypto";
import {
  ownerExperience,
  experienceAdmin,
  safeMutation,
} from "@/lib/experiences/server";
import {
  liveConversationSchema,
  liveEvidence,
} from "@/lib/experiences/live-schema";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
const failure = (status: number) =>
  Response.json(
    {
      error:
        "Live interview is unavailable. Your draft is kept; you can record or write instead.",
    },
    { status },
  );
export async function POST(request: Request, { params }: Context) {
  if (!safeMutation(request)) return failure(403);
  const { id } = await params;
  const owned = await ownerExperience(id);
  if (!owned) return failure(404);
  if (owned.experience.status !== "draft") return failure(409);
  const key = (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY)?.trim();
  if (!key) return failure(503);
  const sdp = await request.text();
  if (sdp.length > 65000 || !sdp.startsWith("v=0")) return failure(400);
  const admin = experienceAdmin();
  const { data: claimed } = await admin.rpc("claim_experience_ai", {
    p_id: id,
  });
  if (!claimed) return failure(429);
  try {
    const { data: source } = await owned.db
      .from("experience_sources")
      .select("notes,transcript,live_conversation")
      .eq("experience_id", id)
      .single();
    const parsed = liveConversationSchema.safeParse(source?.live_conversation);
    const context = [
      source?.notes,
      source?.transcript,
      parsed.success ? liveEvidence(parsed.data) : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(-16000);
    const session = {
      type: "realtime",
      model: process.env.EXPERIENCE_LIVE_MODEL || "gpt-realtime-mini",
      max_output_tokens: 400,
      tools: [
        {
          type: "function",
          name: "set_interview_style",
          description:
            "Adapt to the contributor's explicit request for quick, natural, more questions (story), or silent listening (monologue).",
          parameters: {
            type: "object",
            properties: {
              style: {
                type: "string",
                enum: ["quick", "natural", "story", "monologue"],
              },
            },
            required: ["style"],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "finish_experience",
          description:
            "End the interview and prepare the private draft when the contributor says they are done, wants to finish/save, or declines to add more. Never publish.",
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
      ],
      instructions: interviewInstructions("quick", 0, context),

      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "low",
            interrupt_response: true,
            create_response: true,
          },
        },
        output: { voice: "marin" },
      },
    };
    const body = new FormData();
    body.set("sdp", sdp);
    body.set("session", JSON.stringify(session));
    const result = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body,
      headers: {
        Authorization: `Bearer ${key}`,
        "OpenAI-Safety-Identifier": createHash("sha256")
          .update(owned.user.id)
          .digest("hex"),
      },
      signal: AbortSignal.timeout(40000),
    });
    if (!result.ok) return failure(503);
    return new Response(await result.text(), {
      headers: {
        "Content-Type": "application/sdp",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return failure(503);
  } finally {
    await admin
      .from("experience_sources")
      .update({ ai_started_at: null })
      .eq("experience_id", id);
  }
}
export async function PUT(request: Request, { params }: Context) {
  if (!safeMutation(request)) return failure(403);
  const { id } = await params;
  const owned = await ownerExperience(id);
  if (!owned) return failure(404);
  if (owned.experience.status !== "draft") return failure(409);
  const raw = await request.text();
  if (raw.length > 250000) return failure(413);
  let input;
  try {
    input = liveConversationSchema.safeParse(JSON.parse(raw));
  } catch {
    return failure(400);
  }
  if (!input.success) return failure(400);
  const { error } = await experienceAdmin().rpc(
    "append_experience_live_turns",
    { p_id: id, p_turns: input.data },
  );
  return error
    ? failure(503)
    : Response.json(
        { ok: true },
        { headers: { "Cache-Control": "private, no-store" } },
      );
}
