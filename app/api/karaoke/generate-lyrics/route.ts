import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/karaoke/generate-lyrics
 *
 * Auto-generate LRC lyrics for a track using Whisper.
 * Called after track upload to enable karaoke.
 *
 * Body: { trackId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Parse body
    const body = await request.json();
    const { trackId } = body;

    if (!trackId) {
      return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
    }

    // Fetch track
    const { data: track, error: trackError } = await supabase
      .from("playlist_tracks")
      .select("id, file_url, title, artist, lyrics_lrc")
      .eq("id", trackId)
      .single();

    if (trackError || !track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    // Skip if already has lyrics (unless force=true)
    const force = body.force === true;
    if (track.lyrics_lrc && !force) {
      return NextResponse.json({
        success: true,
        message: "Track already has lyrics",
        skipped: true,
      });
    }

    // Download audio
    const audioResponse = await fetch(track.file_url);
    if (!audioResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch audio file" },
        { status: 500 }
      );
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer]);

    // Call Whisper API
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");
    formData.append("timestamp_granularities[]", "word");

    const whisperResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: formData,
      }
    );

    if (!whisperResponse.ok) {
      const error = await whisperResponse.text();
      console.error("Whisper API error:", error);
      return NextResponse.json(
        { error: "Whisper transcription failed" },
        { status: 500 }
      );
    }

    const whisperResult = await whisperResponse.json();

    // Convert to LRC format
    const lrcLines: string[] = [];
    lrcLines.push(`[la:${whisperResult.language || "en"}]`);
    lrcLines.push("");

    for (const segment of whisperResult.segments || []) {
      const min = Math.floor(segment.start / 60);
      const sec = Math.floor(segment.start % 60);
      const cs = Math.round((segment.start % 1) * 100);
      const timestamp = `${min.toString().padStart(2, "0")}:${sec
        .toString()
        .padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
      const text = segment.text?.trim();
      if (text) {
        lrcLines.push(`[${timestamp}]${text}`);
      }
    }

    const lrc = lrcLines.join("\n");

    // Save to database
    const { error: updateError } = await supabase
      .from("playlist_tracks")
      .update({ lyrics_lrc: lrc })
      .eq("id", trackId);

    if (updateError) {
      console.error("Failed to save lyrics:", updateError);
      return NextResponse.json(
        { error: "Failed to save lyrics" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      language: whisperResult.language,
      lineCount: lrcLines.length - 2, // Subtract metadata lines
      transcript: whisperResult.text,
    });
  } catch (error) {
    console.error("Generate lyrics error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
