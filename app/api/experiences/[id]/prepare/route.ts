import {
  liveConversationSchema,
  liveEvidence,
} from "@/lib/experiences/live-schema";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  bucket,
  ownerExperience,
  experienceAdmin,
  safeMutation,
} from "@/lib/experiences/server";
import { audioFormat } from "@/lib/experiences/schema";
import { transcribe, structureExperience } from "@/lib/experiences/provider";
export const maxDuration = 180;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!safeMutation(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const owned = await ownerExperience(id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (owned.experience.status !== "draft")
    return NextResponse.json(
      { error: "Unpublish before editing" },
      { status: 409 },
    );
  const input = z
    .object({
      audio_id: z.string().uuid().optional(),
      locale: z.string().max(20),
    })
    .safeParse(await request.json());
  if (!input.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const admin = experienceAdmin();
  const { data: claimed } = await admin.rpc("claim_experience_ai", {
    p_id: id,
  });
  if (!claimed)
    return NextResponse.json(
      {
        error: "Please wait before trying again, or continue editing manually.",
      },
      { status: 429 },
    );
  try {
    const { data: source } = await admin
      .from("experience_sources")
      .select("*")
      .eq("experience_id", id)
      .single();
    let transcript = source?.transcript || "";
    let transcription = null;
    if (
      input.data.audio_id &&
      !(source?.transcribed_audio_ids || []).includes(input.data.audio_id)
    ) {
      const { data: audio } = await admin
        .from("experience_media")
        .select("*")
        .eq("experience_id", id)
        .eq("id", input.data.audio_id)
        .eq("kind", "audio")
        .eq("capture_mode", "record")
        .single();
      if (!audio) throw new Error("missing_audio");
      const { data: file } = await admin.storage
        .from(bucket)
        .download(audio.path);
      if (!file || file.size > 20 * 1024 * 1024)
        throw new Error("missing_audio");
      transcription = await transcribe(
        Buffer.from(await file.arrayBuffer()).toString("base64"),
        audioFormat(audio.mime)!,
      );
      transcript = [transcript, transcription.text]
        .filter(Boolean)
        .join("\n\n");
      const { error } = await admin
        .from("experience_sources")
        .update({
          transcript,
          transcribed_audio_ids: [
            ...(source?.transcribed_audio_ids || []),
            input.data.audio_id,
          ],
        })
        .eq("experience_id", id);
      if (error) throw new Error("save_failed");
    }
    const conversation = liveConversationSchema.safeParse(
      source?.live_conversation,
    );
    const text = [
      transcript,
      conversation.success ? liveEvidence(conversation.data) : "",
      source?.notes || "",
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!text.trim()) throw new Error("no_story");
    const { data: media } = await admin
      .from("experience_media")
      .select("id,preview_path")
      .eq("experience_id", id)
      .eq("kind", "photo")
      .in("id", owned.experience.selected_media)
      .limit(6);
    const photos = [];
    for (const p of media || []) {
      if (!p.preview_path) continue;
      const { data: file } = await admin.storage
        .from(bucket)
        .download(p.preview_path);
      if (file)
        photos.push({
          id: p.id,
          url: `data:image/jpeg;base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`,
        });
    }
    const generated = await structureExperience(
      text,
      input.data.locale,
      owned.experience.visit_date,
      photos,
    );
    const { error } = await admin
      .from("experience_sources")
      .update({
        optional_question: generated.story.optional_question,
        generation: {
          ...generated,
          transcription,
          created_at: new Date().toISOString(),
        },
      })
      .eq("experience_id", id);
    if (error) throw new Error("save_failed");
    // Generation is a suggestion. It never overwrites the contributor's saved story or publishes it.
    return NextResponse.json(
      { story: generated.story, transcript },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Your saved recording and notes are safe. Try again or write your story below.",
      },
      { status: 503 },
    );
  } finally {
    await admin
      .from("experience_sources")
      .update({ ai_started_at: null })
      .eq("experience_id", id);
  }
}
