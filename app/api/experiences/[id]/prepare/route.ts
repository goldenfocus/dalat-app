import { venueCandidates } from "@/lib/experiences/venue-candidates";
import { photoContext } from "@/lib/experiences/photo-context";
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
    const { data: media } = await admin
      .from("experience_media")
      .select("id,preview_path,path")
      .eq("experience_id", id)
      .eq("kind", "photo")
      .in("id", owned.experience.selected_media)
      .limit(12);
    const photos = [];
    const contexts = [];
    for (const p of media || []) {
      if (!p.preview_path) continue;
      const original = await admin.storage.from(bucket).download(p.path);
      if (original.data)
        contexts.push(
          await photoContext(new Uint8Array(await original.data.arrayBuffer())),
        );
      const { data: file } = await admin.storage
        .from(bucket)
        .download(p.preview_path);
      if (file)
        photos.push({
          id: p.id,
          url: `data:image/jpeg;base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`,
        });
    }
    if (!text.trim() && !photos.length) throw new Error("no_story");
    const nearby = new Map<
      string,
      { id: string; name: string; address: string }
    >();
    for (const context of contexts) {
      if (!context.gps) continue;
      const { latitude: lat, longitude: lng } = context.gps;
      const { data: candidates } = await owned.db
        .from("venues")
        .select("id,name,address,latitude,longitude")
        .gte("latitude", lat - 0.0018)
        .lte("latitude", lat + 0.0018)
        .gte("longitude", lng - 0.0019)
        .lte("longitude", lng + 0.0019)
        .limit(8);
      for (const candidate of candidates || [])
        nearby.set(candidate.id, {
          id: candidate.id,
          name: candidate.name,
          address: candidate.address || "",
        });
    }
    const dates = [...new Set(contexts.map((c) => c.date).filter(Boolean))];
    const photoHints = {
      venues: [...nearby.values()].slice(0, 5),
      hasLocation: contexts.some((c) => !!c.gps),
      date: dates.length === 1 ? dates[0] : null,
    };
    const generated = await structureExperience(
      text,
      input.data.locale,
      owned.experience.visit_date,
      photos,
    );
    const nameMatches = await venueCandidates(generated.story.venue_name);
    const merged = new Map(
      [...nameMatches, ...photoHints.venues].map((v) => [v.id, v]),
    );
    const venueHints = {
      ...photoHints,
      venues: [...merged.values()].slice(0, 5),
      basis: nameMatches.length ? "name" : "photo",
    };
    const { error } = await admin
      .from("experience_sources")
      .update({
        optional_question: generated.story.optional_question,
        generation: {
          ...generated,
          photoHints: venueHints,
          transcription,
          created_at: new Date().toISOString(),
        },
      })
      .eq("experience_id", id);
    if (error) throw new Error("save_failed");
    // Generation is a suggestion. It never overwrites the contributor's saved story or publishes it.
    return NextResponse.json(
      { story: generated.story, transcript, photoHints: venueHints },
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
