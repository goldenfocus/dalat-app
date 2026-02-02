import Anthropic from "@anthropic-ai/sdk";
import { analyzeImage, type ImageAnalysis } from "./image-analyzer";

const anthropic = new Anthropic();

export interface VideoAnalysis {
  ai_description: string;
  ai_title: string;
  ai_tags: string[];
  scene_description: string;
  mood: string;
  quality_score: number;
  video_transcript: string | null;
  video_summary: string | null;
  key_frame_urls: string[];
  content_language: string;
}

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

/**
 * Fetch transcript from Cloudflare Stream captions if available.
 * Falls back to null if no captions are available.
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

  try {
    // First, check if captions exist
    const captionsResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoUid}/captions`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }
    );

    if (!captionsResponse.ok) {
      return null;
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
      return null;
    }

    const vttData = await vttResponse.json();
    const vttContent = vttData.result?.vtt || "";

    // Parse VTT to extract text
    const text = parseVTTToText(vttContent);

    return { text, language };
  } catch (error) {
    console.error("Error fetching Cloudflare transcript:", error);
    return null;
  }
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
 * Summarize video content using Claude based on frame analysis and transcript.
 */
async function summarizeVideo(
  frameAnalyses: ImageAnalysis[],
  transcript: string | null
): Promise<{
  ai_description: string;
  ai_title: string;
  video_summary: string;
  ai_tags: string[];
  mood: string;
}> {
  const frameDescriptions = frameAnalyses
    .map((f, i) => `Frame ${i + 1}: ${f.scene_description}`)
    .join("\n");

  const prompt = `Summarize this video from an event in Đà Lạt, Vietnam.

Frame descriptions:
${frameDescriptions}

${transcript ? `Transcript:\n${transcript.slice(0, 2000)}` : "No transcript available."}

Return JSON:
{
  "ai_description": "2-3 sentence SEO description of the video content",
  "ai_title": "Short catchy title (5-10 words)",
  "video_summary": "Detailed summary of what happens in the video (2-4 sentences)",
  "ai_tags": ["array", "of", "relevant", "keywords"],
  "mood": "one word mood: festive, calm, energetic, intimate, joyful, dramatic, peaceful, vibrant"
}

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
      throw new Error("Could not parse video summary response");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Error summarizing video:", error);
    // Return aggregated data from frames as fallback
    return {
      ai_description: frameAnalyses[0]?.ai_description || "Video from event",
      ai_title: frameAnalyses[0]?.ai_title || "Event video",
      video_summary: frameDescriptions,
      ai_tags: [...new Set(frameAnalyses.flatMap((f) => f.ai_tags))].slice(0, 10),
      mood: frameAnalyses[0]?.mood || "neutral",
    };
  }
}

/**
 * Analyze a video using frame extraction and optional transcript.
 */
export async function analyzeVideo(
  playbackUrl: string,
  videoUid: string,
  durationSeconds?: number
): Promise<VideoAnalysis> {
  // Get key frame URLs
  const timestamps = durationSeconds
    ? [0, Math.floor(durationSeconds * 0.25), Math.floor(durationSeconds * 0.5), Math.floor(durationSeconds * 0.75)]
    : [0, 10, 20, 30];

  const keyFrameUrls = getKeyFrameUrls(playbackUrl, timestamps);

  // Analyze key frames (use first 2-3 to save costs)
  const framesToAnalyze = keyFrameUrls.slice(0, 3);
  const frameAnalyses: ImageAnalysis[] = [];

  for (const url of framesToAnalyze) {
    try {
      const analysis = await analyzeImage(url);
      frameAnalyses.push(analysis);
    } catch (error) {
      console.error("Error analyzing frame:", url, error);
    }
  }

  if (frameAnalyses.length === 0) {
    throw new Error("Could not analyze any video frames");
  }

  // Get transcript from Cloudflare
  const transcriptResult = await getCloudflareTranscript(videoUid);

  // Generate summary
  const summary = await summarizeVideo(
    frameAnalyses,
    transcriptResult?.text || null
  );

  // Aggregate quality score from frames
  const avgQuality =
    frameAnalyses.reduce((sum, f) => sum + f.quality_score, 0) /
    frameAnalyses.length;

  return {
    ai_description: summary.ai_description,
    ai_title: summary.ai_title,
    ai_tags: summary.ai_tags,
    scene_description: frameAnalyses[0]?.scene_description || "",
    mood: summary.mood,
    quality_score: avgQuality,
    video_transcript: transcriptResult?.text || null,
    video_summary: summary.video_summary,
    key_frame_urls: keyFrameUrls,
    content_language: transcriptResult?.language || frameAnalyses[0]?.content_language || "en",
  };
}
