/**
 * Video caption contract for the keyless captioning pipeline.
 *
 * The cron extracts key-frame URLs + the Cloudflare Stream transcript at
 * enqueue time and writes them into the caption_jobs row along with the
 * prompt built here. The Mac mini worker runs the vision model over the
 * frames; normalizeVideoAnalysis() validates the raw JSON on completion.
 */

export interface VideoAnalysis {
  ai_description: string;
  ai_title: string;
  ai_tags: string[];
  scene_description: string;
  mood: string;
  video_summary: string;
  content_language: string;
}

/** Bump when the prompt changes — jobs carry it, so re-runs are a WHERE clause. */
export const VIDEO_PROMPT_VERSION = "v2-slim";

/**
 * Extract key frame URLs from Cloudflare Stream video.
 * Cloudflare provides thumbnail URLs at specific timestamps.
 */
export function getKeyFrameUrls(
  playbackUrl: string,
  timestamps: number[] = [0, 25, 50, 75]
): string[] {
  // Cloudflare Stream thumbnail format:
  // https://customer-xxx.cloudflarestream.com/{video_id}/thumbnails/thumbnail.jpg?time={seconds}s
  // We need to extract the video ID from the playback URL

  // playbackUrl format: https://customer-xxx.cloudflarestream.com/{video_id}/manifest/video.m3u8
  const match = playbackUrl.match(/cloudflarestream\.com\/([a-zA-Z0-9]+)/);
  if (!match) {
    console.error("Could not extract video ID from playback URL:", playbackUrl);
    return [];
  }

  const videoId = match[1];
  const baseUrl = playbackUrl.split(videoId)[0] + videoId;

  return timestamps.map(
    (time) => `${baseUrl}/thumbnails/thumbnail.jpg?time=${time}s&width=640`
  );
}

/** Key-frame timestamps for a video of known (or unknown) duration. */
export function keyFrameTimestamps(durationSeconds?: number | null): number[] {
  return durationSeconds
    ? [
        0,
        Math.floor(durationSeconds * 0.25),
        Math.floor(durationSeconds * 0.5),
        Math.floor(durationSeconds * 0.75),
      ]
    : [0, 10, 20, 30];
}

/**
 * Fetch transcript from Cloudflare Stream captions.
 *
 * Returns null only when captions legitimately don't exist (none generated,
 * or no video-captions resource). Request failures THROW: the transcript is
 * resolved once at enqueue and baked into the job row permanently, so a
 * transient CF error swallowed here would silently strip transcripts from
 * captions with no way to tell it apart from "video has no speech".
 */
export async function getCloudflareTranscript(
  videoUid: string
): Promise<{ text: string; language: string } | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    console.warn("Cloudflare credentials not configured, skipping transcript");
    return null;
  }

  // First, check if captions exist
  const captionsResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoUid}/captions`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    }
  );

  if (captionsResponse.status === 404) {
    return null; // no captions resource for this video
  }
  if (!captionsResponse.ok) {
    throw new Error(`CF captions list failed (${captionsResponse.status}) for ${videoUid}`);
  }

  const captionsData = await captionsResponse.json();
  const captions = captionsData.result || [];

  if (captions.length === 0) {
    return null;
  }

  // Get the first available caption track
  const caption = captions[0];
  const language = caption.label || caption.language || "en";

  // Fetch the VTT content
  const vttResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoUid}/captions/${caption.language}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    }
  );

  if (!vttResponse.ok) {
    throw new Error(`CF captions fetch failed (${vttResponse.status}) for ${videoUid}`);
  }

  const vttData = await vttResponse.json();
  const vttContent = vttData.result?.vtt || "";

  // Parse VTT to extract text
  const text = parseVTTToText(vttContent);

  return { text, language };
}

/**
 * Parse VTT content to plain text.
 */
function parseVTTToText(vtt: string): string {
  // VTT format:
  // WEBVTT
  //
  // 00:00:00.000 --> 00:00:02.000
  // Hello world
  //
  // 00:00:02.000 --> 00:00:04.000
  // This is a test

  const lines = vtt.split("\n");
  const textLines: string[] = [];

  for (const line of lines) {
    // Skip headers, timestamps, and empty lines
    if (
      line.startsWith("WEBVTT") ||
      line.includes("-->") ||
      line.match(/^\d{2}:\d{2}/) ||
      line.trim() === ""
    ) {
      continue;
    }
    // Skip speaker labels like "<v Speaker>"
    const cleanLine = line.replace(/<[^>]+>/g, "").trim();
    if (cleanLine) {
      textLines.push(cleanLine);
    }
  }

  return textLines.join(" ");
}

/**
 * Build the worker prompt for a video job: the model sees the key frames as
 * images and this text alongside them.
 */
export function buildVideoAnalysisPrompt(transcript: string | null): string {
  return `The attached images are key frames (in chronological order) from one video recorded at an event in Đà Lạt, Vietnam. Analyze the VIDEO they represent and extract metadata for SEO and search.

PRIVACY RULES (mandatory):
- Describe the SCENE only. Never identify, name, or describe individual people's appearance, clothing, or distinguishing features.
- Location references stay at neighborhood level or broader. Never guess a specific address, street number, or whose home a place might be.
- Do not transcribe text that reveals personal information (names, phone numbers, addresses).

${transcript ? `Transcript:\n${transcript.slice(0, 2000)}` : "No transcript available."}

Return a JSON object with these exact fields:
{
  "ai_description": "2-3 sentence SEO description of the video content",
  "ai_title": "Short catchy title (5-10 words)",
  "ai_tags": ["array", "of", "relevant", "keywords", "max 10"],
  "scene_description": "Detailed description of the setting and what happens across the video",
  "mood": "one word: festive, calm, energetic, intimate, joyful, dramatic, peaceful, vibrant, cozy, or nostalgic",
  "video_summary": "Detailed summary of what happens in the video (2-4 sentences)",
  "content_language": "language of the transcript or visible public text, or 'en' if none"
}

Be specific and descriptive — generic captions are useless for search. Focus on Đà Lạt/Vietnamese cultural context when relevant.
Output ONLY the JSON object, no other text.`;
}

/**
 * Turn untrusted model output into a safe, typed analysis.
 * Throws when the load-bearing field (ai_description) is missing.
 */
export function normalizeVideoAnalysis(raw: unknown): VideoAnalysis {
  const result = (raw ?? {}) as Record<string, unknown>;
  const description = String(result.ai_description || "").trim();
  if (!description) {
    throw new Error("Model output missing ai_description");
  }
  return {
    ai_description: description,
    ai_title: String(result.ai_title || "").trim(),
    ai_tags: Array.isArray(result.ai_tags)
      ? result.ai_tags.slice(0, 10).map(String)
      : [],
    scene_description: String(result.scene_description || "").trim(),
    mood: String(result.mood || "neutral"),
    video_summary: String(result.video_summary || "").trim(),
    content_language: String(result.content_language || "en"),
  };
}
