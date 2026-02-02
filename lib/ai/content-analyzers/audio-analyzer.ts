import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface AudioAnalysis {
  ai_description: string;
  ai_title: string;
  ai_tags: string[];
  audio_transcript: string | null;
  audio_summary: string | null;
  audio_language: string;
  mood: string;
  quality_score: number;
}

/**
 * Transcribe audio using OpenAI Whisper API.
 * Falls back to description-only if Whisper is not available.
 */
async function transcribeWithWhisper(
  audioUrl: string
): Promise<{ text: string; language: string } | null> {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    console.warn("OpenAI API key not configured, skipping Whisper transcription");
    return null;
  }

  try {
    // Download the audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer]);

    // Create form data for Whisper API
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");

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
      throw new Error(`Whisper API error: ${error}`);
    }

    const result = await whisperResponse.json();

    return {
      text: result.text || "",
      language: result.language || "en",
    };
  } catch (error) {
    console.error("Error transcribing audio with Whisper:", error);
    return null;
  }
}

/**
 * Summarize audio content using Claude based on transcript and metadata.
 */
async function summarizeAudio(
  transcript: string | null,
  existingMetadata: {
    title?: string | null;
    artist?: string | null;
    album?: string | null;
    genre?: string | null;
  }
): Promise<{
  ai_description: string;
  ai_title: string;
  audio_summary: string;
  ai_tags: string[];
  mood: string;
}> {
  const metadataContext = [
    existingMetadata.title && `Title: ${existingMetadata.title}`,
    existingMetadata.artist && `Artist: ${existingMetadata.artist}`,
    existingMetadata.album && `Album: ${existingMetadata.album}`,
    existingMetadata.genre && `Genre: ${existingMetadata.genre}`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Analyze this audio content from an event in Đà Lạt, Vietnam.

${metadataContext ? `Existing metadata:\n${metadataContext}\n` : ""}
${transcript ? `Transcript/Lyrics:\n${transcript.slice(0, 2000)}` : "No transcript available."}

Return JSON:
{
  "ai_description": "2-3 sentence SEO description of the audio content",
  "ai_title": "Short catchy title (5-10 words)",
  "audio_summary": "Brief summary of the audio content (1-2 sentences)",
  "ai_tags": ["array", "of", "relevant", "keywords"],
  "mood": "one word: festive, calm, energetic, intimate, joyful, dramatic, peaceful, vibrant, groovy, mellow"
}

If there's no transcript, base description on available metadata.
Output ONLY the JSON object.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-20250514",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Could not parse audio summary response");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Error summarizing audio:", error);
    return {
      ai_description: existingMetadata.title
        ? `${existingMetadata.title}${existingMetadata.artist ? ` by ${existingMetadata.artist}` : ""}`
        : "Audio from event",
      ai_title: existingMetadata.title || "Event audio",
      audio_summary: existingMetadata.genre
        ? `${existingMetadata.genre} audio`
        : "Audio recording",
      ai_tags: [existingMetadata.genre, existingMetadata.artist, "audio", "music"]
        .filter(Boolean) as string[],
      mood: "neutral",
    };
  }
}

/**
 * Analyze audio content using Whisper transcription and Claude summarization.
 */
export async function analyzeAudio(
  audioUrl: string,
  existingMetadata?: {
    title?: string | null;
    artist?: string | null;
    album?: string | null;
    genre?: string | null;
    duration_seconds?: number | null;
  }
): Promise<AudioAnalysis> {
  // Try to transcribe with Whisper
  const transcriptResult = await transcribeWithWhisper(audioUrl);

  // Generate summary using Claude
  const summary = await summarizeAudio(transcriptResult?.text || null, {
    title: existingMetadata?.title,
    artist: existingMetadata?.artist,
    album: existingMetadata?.album,
    genre: existingMetadata?.genre,
  });

  // Calculate quality score based on available metadata
  let qualityScore = 0.5;
  if (existingMetadata?.title) qualityScore += 0.1;
  if (existingMetadata?.artist) qualityScore += 0.1;
  if (existingMetadata?.album) qualityScore += 0.05;
  if (transcriptResult?.text) qualityScore += 0.15;
  qualityScore = Math.min(1, qualityScore);

  return {
    ai_description: summary.ai_description,
    ai_title: summary.ai_title,
    ai_tags: summary.ai_tags,
    audio_transcript: transcriptResult?.text || null,
    audio_summary: summary.audio_summary,
    audio_language: transcriptResult?.language || "en",
    mood: summary.mood,
    quality_score: qualityScore,
  };
}
