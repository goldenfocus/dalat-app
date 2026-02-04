/**
 * Backfill script: Generate LRC lyrics for all existing audio
 *
 * This script:
 * 1. Fetches all audio moments, event_materials, and playlist_tracks without lyrics_lrc
 * 2. Calls Whisper API with timestamp_granularities to get timed transcription
 * 3. Converts to LRC format
 * 4. Updates the database
 *
 * Usage:
 *   npx tsx scripts/backfill-lyrics-lrc.ts
 *
 * Options:
 *   --dry-run    Preview what would be processed without making changes
 *   --limit=N    Process only N items (for testing)
 *   --type=TYPE  Process only 'moments', 'materials', or 'playlist'
 */

// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!openaiApiKey) {
  console.error("Missing OPENAI_API_KEY - required for Whisper transcription");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
const typeArg = args.find((a) => a.startsWith("--type="));
const typeFilter = typeArg ? typeArg.split("=")[1] : undefined;

interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: { word: string; start: number; end: number }[];
}

interface WhisperResponse {
  text: string;
  language: string;
  duration: number;
  segments: WhisperSegment[];
  words?: { word: string; start: number; end: number }[];
}

/**
 * Call Whisper API with timestamp granularities for LRC generation.
 */
async function transcribeWithTimestamps(
  audioUrl: string
): Promise<WhisperResponse | null> {
  try {
    console.log(`  Downloading audio from: ${audioUrl.slice(0, 80)}...`);

    // Download the audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer]);

    console.log(`  Audio size: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`);

    // Create form data for Whisper API with timestamp granularities
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");
    formData.append("timestamp_granularities[]", "word");

    console.log("  Calling Whisper API...");

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

    const result: WhisperResponse = await whisperResponse.json();
    console.log(
      `  Transcription complete: ${result.segments?.length || 0} segments, ${result.words?.length || 0} words`
    );

    return result;
  } catch (error) {
    console.error("  Error transcribing audio:", error);
    return null;
  }
}

/**
 * Convert Whisper response to LRC format.
 */
function whisperToLrc(response: WhisperResponse): string {
  const lines: string[] = [];

  // Add metadata
  lines.push(`[la:${response.language || "vi"}]`);
  lines.push("");

  // Convert each segment to LRC line
  for (const segment of response.segments) {
    const timestamp = formatLrcTimestamp(segment.start);
    const text = segment.text.trim();
    if (text) {
      lines.push(`[${timestamp}]${text}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format seconds to LRC timestamp (mm:ss.xx)
 */
function formatLrcTimestamp(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

/**
 * Process audio moments without lyrics_lrc.
 */
async function processAudioMoments() {
  console.log("\n=== Processing Audio Moments ===\n");

  // Fetch audio moments that need LRC
  let query = supabase
    .from("moments")
    .select(
      `
      id,
      file_url,
      title,
      artist,
      moment_metadata!left(lyrics_lrc, audio_transcript)
    `
    )
    .eq("content_type", "audio")
    .eq("status", "published")
    .not("file_url", "is", null);

  if (limit) {
    query = query.limit(limit);
  }

  const { data: moments, error } = await query;

  if (error) {
    console.error("Error fetching moments:", error);
    return { processed: 0, skipped: 0, failed: 0 };
  }

  console.log(`Found ${moments?.length || 0} audio moments`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const moment of moments || []) {
    const metadata = moment.moment_metadata?.[0] || moment.moment_metadata;

    // Skip if already has LRC
    if (metadata?.lyrics_lrc) {
      console.log(`[SKIP] Moment ${moment.id} - already has LRC`);
      skipped++;
      continue;
    }

    console.log(`\n[${processed + failed + 1}] Processing moment: ${moment.id}`);
    console.log(`  Title: ${moment.title || "Untitled"}`);
    console.log(`  Artist: ${moment.artist || "Unknown"}`);

    if (dryRun) {
      console.log("  [DRY RUN] Would transcribe and generate LRC");
      processed++;
      continue;
    }

    // Transcribe with Whisper
    const transcription = await transcribeWithTimestamps(moment.file_url);

    if (!transcription) {
      console.log("  [FAILED] Could not transcribe audio");
      failed++;
      continue;
    }

    // Convert to LRC
    const lrc = whisperToLrc(transcription);
    console.log(`  Generated LRC with ${lrc.split("\n").length} lines`);

    // Update database
    const { error: updateError } = await supabase.rpc("upsert_moment_metadata", {
      p_moment_id: moment.id,
      p_lyrics_lrc: lrc,
      p_audio_transcript: transcription.text,
      p_audio_language: transcription.language,
    });

    if (updateError) {
      console.error("  [FAILED] Error updating metadata:", updateError);
      failed++;
    } else {
      console.log("  [SUCCESS] Updated moment_metadata with LRC");
      processed++;
    }

    // Rate limiting - wait 1 second between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { processed, skipped, failed };
}

/**
 * Process event_materials (playlist audio) without lyrics_lrc.
 */
async function processEventMaterials() {
  console.log("\n=== Processing Event Materials ===\n");

  // Fetch audio materials that need LRC
  let query = supabase
    .from("event_materials")
    .select("id, file_url, title, artist, lyrics_lrc")
    .eq("material_type", "audio")
    .is("lyrics_lrc", null)
    .not("file_url", "is", null);

  if (limit) {
    query = query.limit(limit);
  }

  const { data: materials, error } = await query;

  if (error) {
    console.error("Error fetching materials:", error);
    return { processed: 0, skipped: 0, failed: 0 };
  }

  console.log(`Found ${materials?.length || 0} audio materials without LRC`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const material of materials || []) {
    console.log(`\n[${processed + failed + 1}] Processing material: ${material.id}`);
    console.log(`  Title: ${material.title || "Untitled"}`);
    console.log(`  Artist: ${material.artist || "Unknown"}`);

    if (dryRun) {
      console.log("  [DRY RUN] Would transcribe and generate LRC");
      processed++;
      continue;
    }

    // Transcribe with Whisper
    const transcription = await transcribeWithTimestamps(material.file_url);

    if (!transcription) {
      console.log("  [FAILED] Could not transcribe audio");
      failed++;
      continue;
    }

    // Convert to LRC
    const lrc = whisperToLrc(transcription);
    console.log(`  Generated LRC with ${lrc.split("\n").length} lines`);

    // Update database
    const { error: updateError } = await supabase
      .from("event_materials")
      .update({ lyrics_lrc: lrc })
      .eq("id", material.id);

    if (updateError) {
      console.error("  [FAILED] Error updating material:", updateError);
      failed++;
    } else {
      console.log("  [SUCCESS] Updated event_materials with LRC");
      processed++;
    }

    // Rate limiting - wait 1 second between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { processed, skipped, failed };
}

/**
 * Process playlist_tracks (event playlist audio) without lyrics_lrc.
 */
async function processPlaylistTracks() {
  console.log("\n=== Processing Playlist Tracks ===\n");

  // Fetch playlist tracks that need LRC
  let query = supabase
    .from("playlist_tracks")
    .select("id, file_url, title, artist, lyrics_lrc")
    .is("lyrics_lrc", null)
    .not("file_url", "is", null);

  if (limit) {
    query = query.limit(limit);
  }

  const { data: tracks, error } = await query;

  if (error) {
    console.error("Error fetching playlist tracks:", error);
    return { processed: 0, skipped: 0, failed: 0 };
  }

  console.log(`Found ${tracks?.length || 0} playlist tracks without LRC`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const track of tracks || []) {
    console.log(`\n[${processed + failed + 1}] Processing playlist track: ${track.id}`);
    console.log(`  Title: ${track.title || "Untitled"}`);
    console.log(`  Artist: ${track.artist || "Unknown"}`);

    if (dryRun) {
      console.log("  [DRY RUN] Would transcribe and generate LRC");
      processed++;
      continue;
    }

    // Transcribe with Whisper
    const transcription = await transcribeWithTimestamps(track.file_url);

    if (!transcription) {
      console.log("  [FAILED] Could not transcribe audio");
      failed++;
      continue;
    }

    // Convert to LRC
    const lrc = whisperToLrc(transcription);
    console.log(`  Generated LRC with ${lrc.split("\n").length} lines`);

    // Update database
    const { error: updateError } = await supabase
      .from("playlist_tracks")
      .update({ lyrics_lrc: lrc })
      .eq("id", track.id);

    if (updateError) {
      console.error("  [FAILED] Error updating playlist track:", updateError);
      failed++;
    } else {
      console.log("  [SUCCESS] Updated playlist_tracks with LRC");
      processed++;
    }

    // Rate limiting - wait 1 second between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { processed, skipped, failed };
}

/**
 * Main function.
 */
async function main() {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║     Backfill LRC Lyrics for Karaoke Feature     ║");
  console.log("╚════════════════════════════════════════════════╝");
  console.log("");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  if (limit) console.log(`Limit: ${limit} items`);
  if (typeFilter) console.log(`Type filter: ${typeFilter}`);
  console.log("");

  let momentsStats = { processed: 0, skipped: 0, failed: 0 };
  let materialsStats = { processed: 0, skipped: 0, failed: 0 };
  let playlistStats = { processed: 0, skipped: 0, failed: 0 };

  if (!typeFilter || typeFilter === "moments") {
    momentsStats = await processAudioMoments();
  }

  if (!typeFilter || typeFilter === "materials") {
    materialsStats = await processEventMaterials();
  }

  if (!typeFilter || typeFilter === "playlist") {
    playlistStats = await processPlaylistTracks();
  }

  // Summary
  console.log("\n════════════════════════════════════════════════");
  console.log("                    SUMMARY                      ");
  console.log("════════════════════════════════════════════════");
  console.log(`Moments:   ${momentsStats.processed} processed, ${momentsStats.skipped} skipped, ${momentsStats.failed} failed`);
  console.log(`Materials: ${materialsStats.processed} processed, ${materialsStats.skipped} skipped, ${materialsStats.failed} failed`);
  console.log(`Playlist:  ${playlistStats.processed} processed, ${playlistStats.skipped} skipped, ${playlistStats.failed} failed`);
  console.log(
    `Total:     ${momentsStats.processed + materialsStats.processed + playlistStats.processed} processed`
  );

  // Cost estimate
  const totalProcessed = momentsStats.processed + materialsStats.processed + playlistStats.processed;
  const estimatedCost = totalProcessed * 0.02; // ~$0.02 per audio file
  console.log(`\nEstimated Whisper API cost: ~$${estimatedCost.toFixed(2)}`);
}

main().catch(console.error);
