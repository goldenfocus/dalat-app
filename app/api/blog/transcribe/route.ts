import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export async function POST(request: Request) {
  try {
    // Verify user is admin
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, can_blog")
      .eq("id", user.id)
      .single();

    // Check blog permission: admin/superadmin role OR can_blog flag
    const canBlog =
      profile?.role === "admin" ||
      profile?.role === "superadmin" ||
      profile?.can_blog === true;

    if (!profile || !canBlog) {
      return NextResponse.json({ error: "Blog access required" }, { status: 403 });
    }

    // Get audio URL from request
    const body = await request.json();
    const { audioUrl } = body;

    if (!audioUrl) {
      return NextResponse.json({ error: "Audio URL is required" }, { status: 400 });
    }

    // Fetch the audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch audio file" }, { status: 400 });
    }

    const audioBlob = await audioResponse.blob();

    // Convert to File for OpenAI API
    const audioFile = new File([audioBlob], "audio.webm", { type: "audio/webm" });

    // Transcribe with Whisper
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[blog/transcribe] OPENAI_API_KEY not found in environment");
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "en", // Can be changed based on user preference
    });

    return NextResponse.json({ transcript: transcription.text });
  } catch (error) {
    console.error("[blog/transcribe] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
