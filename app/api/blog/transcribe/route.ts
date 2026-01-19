import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

// Whisper transcription can take 30-60s for longer audio
export const maxDuration = 60;

// Check env var at module load time (try both names)
const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;

// GET: Diagnostic endpoint to check if env vars are configured
export async function GET() {
  // List all env vars containing certain keywords (keys only, not values)
  const allEnvKeys = Object.keys(process.env);
  const relevantKeys = allEnvKeys.filter(k =>
    k.includes('OPENAI') || k.includes('API_KEY') || k.includes('KEY')
  );

  const envCheck = {
    OPENAI_API_KEY_exists: !!process.env.OPENAI_API_KEY,
    OPENAI_KEY_exists: !!process.env.OPENAI_KEY,
    resolved_key_exists: !!OPENAI_KEY,
    keyLength: OPENAI_KEY?.length ?? 0,
    keyPrefix: OPENAI_KEY?.substring(0, 7) ?? "missing",
    relevantEnvVars: relevantKeys,
    totalEnvVars: allEnvKeys.length,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(envCheck);
}

export async function POST(request: Request) {
  try {
    // Verify user has blog permission
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

    // Check API key before fetching audio (fail fast)
    if (!OPENAI_KEY) {
      console.error("[blog/transcribe] OPENAI_API_KEY not configured at module load");
      return NextResponse.json({
        error: "Transcription service not configured",
        debug: {
          envVarExists: false,
          hint: "OPENAI_API_KEY environment variable is missing"
        }
      }, { status: 503 });
    }

    // Fetch the audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return NextResponse.json({
        error: "Failed to fetch audio file",
        status: audioResponse.status
      }, { status: 400 });
    }

    const audioBlob = await audioResponse.blob();

    // Convert to File for OpenAI API
    const audioFile = new File([audioBlob], "audio.webm", { type: "audio/webm" });

    // Transcribe with Whisper
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
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
